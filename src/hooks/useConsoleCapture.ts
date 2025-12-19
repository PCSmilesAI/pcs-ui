'use client';

import { useEffect, useRef, useCallback } from 'react';

export interface ConsoleEntry {
  timestamp: string;
  level: 'log' | 'warn' | 'error' | 'info';
  message: string;
  stack?: string;
}

// Global storage for console logs (persists across component remounts)
const globalConsoleLogs: ConsoleEntry[] = [];
const MAX_LOGS = 100;
let isInitialized = false;

/**
 * Hook to capture browser console output for bug reporting.
 * Intercepts console.log, console.warn, console.error, and console.info
 * and stores them in a circular buffer.
 */
export function useConsoleCapture() {
  const logsRef = useRef<ConsoleEntry[]>(globalConsoleLogs);

  useEffect(() => {
    // Only initialize once globally
    if (isInitialized) return;
    isInitialized = true;

    // Store original console methods
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalInfo = console.info;

    const addEntry = (level: ConsoleEntry['level'], args: unknown[]) => {
      const entry: ConsoleEntry = {
        timestamp: new Date().toISOString(),
        level,
        message: args.map(arg => {
          if (arg instanceof Error) {
            return `${arg.name}: ${arg.message}`;
          }
          if (typeof arg === 'object') {
            try {
              return JSON.stringify(arg, null, 2);
            } catch {
              return String(arg);
            }
          }
          return String(arg);
        }).join(' '),
      };

      // Capture stack trace for errors
      if (level === 'error') {
        const stack = new Error().stack;
        if (stack) {
          entry.stack = stack.split('\n').slice(3).join('\n'); // Remove the wrapper frames
        }
      }

      // Add to circular buffer
      globalConsoleLogs.push(entry);
      if (globalConsoleLogs.length > MAX_LOGS) {
        globalConsoleLogs.shift();
      }
    };

    // Override console methods
    console.log = (...args: unknown[]) => {
      addEntry('log', args);
      originalLog.apply(console, args);
    };

    console.warn = (...args: unknown[]) => {
      addEntry('warn', args);
      originalWarn.apply(console, args);
    };

    console.error = (...args: unknown[]) => {
      addEntry('error', args);
      originalError.apply(console, args);
    };

    console.info = (...args: unknown[]) => {
      addEntry('info', args);
      originalInfo.apply(console, args);
    };

    // Also capture unhandled errors
    const handleError = (event: ErrorEvent) => {
      addEntry('error', [`Unhandled Error: ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`]);
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      addEntry('error', [`Unhandled Promise Rejection: ${event.reason}`]);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    // Cleanup is intentionally not done to keep capturing across navigations
    // The console overrides persist for the lifetime of the page
  }, []);

  const getLogs = useCallback((): ConsoleEntry[] => {
    return [...logsRef.current];
  }, []);

  const getLogsFormatted = useCallback((): string => {
    return logsRef.current
      .map(entry => {
        const time = new Date(entry.timestamp).toLocaleTimeString();
        const levelIcon = {
          log: '📝',
          warn: '⚠️',
          error: '❌',
          info: 'ℹ️',
        }[entry.level];
        let line = `[${time}] ${levelIcon} ${entry.level.toUpperCase()}: ${entry.message}`;
        if (entry.stack) {
          line += `\n   Stack: ${entry.stack.split('\n')[0]}`;
        }
        return line;
      })
      .join('\n');
  }, []);

  const clearLogs = useCallback(() => {
    globalConsoleLogs.length = 0;
  }, []);

  return {
    getLogs,
    getLogsFormatted,
    clearLogs,
    logCount: globalConsoleLogs.length,
  };
}

export default useConsoleCapture;




