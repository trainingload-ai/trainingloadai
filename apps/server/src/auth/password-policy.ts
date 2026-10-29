export const PASSWORD_POLICY_REGEX = /^(?=.*[A-Za-z])(?=.*\d)[^\s]{8,20}$/;

export const PASSWORD_POLICY_MESSAGE =
  'Password must be 8-20 characters and contain at least one letter and one number';

export function passwordMeetsPolicy(password: string): boolean {
  return PASSWORD_POLICY_REGEX.test(password);
}
