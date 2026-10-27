import type { CompanionId } from './state';

// Later tasks add members to these unions.
export type Command = { t: 'foundCompany'; name: string; companionId: CompanionId };

export type CommandError =
  'ALREADY_FOUNDED' | 'NOT_FOUNDED' | 'INVALID_NAME' | 'COMPANION_UNAVAILABLE' | 'UNKNOWN_ID';

export type CommandResult = { ok: true } | { ok: false; error: CommandError };

export const OK: CommandResult = { ok: true };
export const fail = (error: CommandError): CommandResult => ({ ok: false, error });

const NAME_RULE = /^[\p{L}\p{N} '.&-]{3,32}$/u;

export function isValidCompanyName(name: string): boolean {
  return NAME_RULE.test(name.trim());
}
