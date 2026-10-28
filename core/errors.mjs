export class HumanCliError extends Error {
  constructor(code, message, status = 400) { super(message); this.name = 'HumanCliError'; this.code = code; this.status = status; }
}
export const fail = (condition, code, message, status) => { if (!condition) throw new HumanCliError(code, message, status); };
export function errorData(error) {
  return { code: error.code || 'E_INTERNAL', message: error.message || String(error), details: error.details || error.stack || String(error) };
}
