export function displayNameError(value) {
  const message = 'Use a display name of 1 to 80 characters without control characters.';
  if (typeof value !== 'string') return message;
  const name = value.trim();
  return !name || name.length > 80 || Array.from(name).some(character => {
    const point = character.codePointAt(0); return point < 32 || point === 127;
  }) ? message : '';
}
