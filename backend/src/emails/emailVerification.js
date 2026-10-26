function emailVerificationEmail({ to, link, minutes }) {
  return { to, subject: 'Verify your Human Testament email',
    text: `Please verify ownership of the email address for your Human Testament account.\n\nUse this link within ${minutes} minutes:\n${link}\n\nIf you did not create this account or request this email, you can ignore it. Email verification does not change your password.` };
}
module.exports = { emailVerificationEmail };
