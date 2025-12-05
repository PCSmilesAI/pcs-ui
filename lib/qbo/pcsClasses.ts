// Hardcoded PCS QBO Classes (locations/departments)
// These are the actual classes from PCS's QuickBooks

export const PCS_CLASSES: Array<{ id: string; name: string; fullName: string }> = [
  // Corporate departments
  { id: 'corp-executive', name: 'Corp-Executive', fullName: 'Corp-Executive' },
  { id: 'corp-finance', name: 'Corp-Finance', fullName: 'Corp-Finance' },
  { id: 'corp-hr', name: 'Corp-HR', fullName: 'Corp-HR' },
  { id: 'corp-it', name: 'Corp-IT', fullName: 'Corp-IT' },
  { id: 'corp-rcm', name: 'Corp-RCM', fullName: 'Corp-RCM' },
  // Divisions
  { id: 'div-marketing', name: 'Div-Marketing', fullName: 'Div-Marketing' },
  { id: 'div-operations', name: 'Div-Operations', fullName: 'Div-Operations' },
  // Dental office locations
  { id: 'general-columbia', name: 'General-Columbia', fullName: 'General-Columbia' },
  { id: 'general-eugene', name: 'General-Eugene', fullName: 'General-Eugene' },
  { id: 'general-insurance', name: 'General-Insurance', fullName: 'General-Insurance' },
  { id: 'general-lebanon', name: 'General-Lebanon', fullName: 'General-Lebanon' },
  { id: 'general-milwaukie', name: 'General-Milwaukie', fullName: 'General-Milwaukie' },
  { id: 'general-riddle', name: 'General-Riddle', fullName: 'General-Riddle' },
  { id: 'general-ridgefield', name: 'General-Ridgefield', fullName: 'General-Ridgefield' },
  { id: 'general-roseburg', name: 'General-Roseburg', fullName: 'General-Roseburg' },
  { id: 'general-salem', name: 'General-Salem', fullName: 'General-Salem' },
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

