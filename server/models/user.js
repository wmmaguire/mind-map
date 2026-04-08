import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, default: '' },
    emailLower: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
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
    return ret;
  },
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

export default User;

