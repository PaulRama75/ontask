// Shared contract for every PIN-gated destructive/sensitive server action.
// A gated action NEVER throws for an expected authorization or PIN failure --
// both travel this same return channel so the client PinConfirmButton /
// PinDialog has exactly one result shape to read. `pinRequired` is true only
// for the NO_PIN case, which drives the forced PIN-setup CTA.
export type GatedResult =
  | { ok: true }
  | { ok: false; error: string; pinRequired?: boolean };
