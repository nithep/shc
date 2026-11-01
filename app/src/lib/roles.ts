export function canCheckout(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'front_desk';
}
