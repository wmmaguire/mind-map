import mongoose from 'mongoose';

/**
 * #102 — Google Sign-In additive fields:
 *   - `googleId` (sparse unique) lets us look up Google-provisioned users without
 *     a second email round-trip; sparse so password-only rows stay unaffected.
 *   - `avatarUrl` + `provider` are exposed on the public user JSON so the banner
 *     can render a Google badge / avatar.
 *   - `emailVerified` tracks Google's `email_verified` claim (password users remain
 *     `false` by default; we don't verify email on /register today).
 *   - `passwordHash` is optional so Google-only accounts can exist; the /login
 *     route rejects such rows with `USE_GOOGLE_SIGN_IN` before bcrypt runs.
 */
const userSchema = new mongoose.Schema(
  {
    name: { type: String, default: '' },
    emailLower: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, default: null },
    passwordResetTokenHash: { type: String, default: null, index: true },
    passwordResetExpiresAt: { type: Date, default: null },
    googleId: { type: String, default: null, unique: true, sparse: true, index: true },
    avatarUrl: { type: String, default: null },
    emailVerified: { type: Boolean, default: false },
    provider: { type: String, enum: ['password', 'google'], default: 'password' },
  },
  { timestamps: true }
);

userSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    delete ret.passwordHash;
    delete ret.emailLower;
    delete ret.passwordResetTokenHash;
    delete ret.passwordResetExpiresAt;
    delete ret.googleId;
    return ret;
  },
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

export default User;

