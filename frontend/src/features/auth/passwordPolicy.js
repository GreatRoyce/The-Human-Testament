export function passwordFormError(values) {
  if (!('newPassword' in values)) return '';
  const password = values.newPassword;
  if (Array.from(password).length < 12 || new TextEncoder().encode(password).length > 72 || !/\S/u.test(password) ||
      Array.from(password).some(character => character.codePointAt(0) < 32 || character.codePointAt(0) === 127))
    return 'Use at least 12 characters and at most 72 UTF-8 bytes, without control characters.';
  return password === values.passwordConfirmation ? '' : 'Password confirmation does not match.';
}
