// Hardcoded PCS QBO Classes (locations/departments)
// These are the actual classes from PCS's QuickBooks with real QBO IDs
// Last synced: January 21, 2026 from production QBO

export const PCS_CLASSES: Array<{ id: string; name: string; fullName: string }> = [
  // Corporate departments
  { id: '1066856', name: 'Corp-Executive', fullName: 'Corp-Executive' },
  { id: '1062870', name: 'Corp-Finance', fullName: 'Corp-Finance' },
  { id: '1265835', name: 'Corp-HR', fullName: 'Corp-HR' },
  { id: '1066858', name: 'Corp-IT', fullName: 'Corp-IT' },
  { id: '1384061', name: 'Corp-Legal', fullName: 'Corp-Legal' },
  { id: '1066862', name: 'Corp-RCM', fullName: 'Corp-RCM' },
  // Divisions
  { id: '1066855', name: 'Div-Marketing', fullName: 'Div-Marketing' },
  { id: '1066857', name: 'Div-Operations', fullName: 'Div-Operations' },
  // Dental office locations
  { id: '1066845', name: 'General-Columbia', fullName: 'General-Columbia' },
  { id: '1066852', name: 'General-Eugene', fullName: 'General-Eugene' },
  { id: '1066851', name: 'General-Lebanon', fullName: 'General-Lebanon' },
  { id: '1066847', name: 'General-Milwaukie', fullName: 'General-Milwaukie' },
  { id: '1066854', name: 'General-Riddle', fullName: 'General-Riddle' },
  { id: '1066844', name: 'General-Ridgefield', fullName: 'General-Ridgefield' },
  { id: '1066853', name: 'General-Roseburg', fullName: 'General-Roseburg' },
  { id: '1066848', name: 'General-Salem', fullName: 'General-Salem' },
];

// Get just the dental office locations (General-*)
export function getDentalOffices(): Array<{ id: string; name: string; fullName: string }> {
  return PCS_CLASSES.filter(c => c.name.startsWith('General-'));
}

// Get just the corporate departments (Corp-*)
export function getCorporateDepartments(): Array<{ id: string; name: string; fullName: string }> {
  return PCS_CLASSES.filter(c => c.name.startsWith('Corp-'));
}

// Get just the divisions (Div-*)
export function getDivisions(): Array<{ id: string; name: string; fullName: string }> {
  return PCS_CLASSES.filter(c => c.name.startsWith('Div-'));
}
