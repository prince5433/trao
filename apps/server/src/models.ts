import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import type { ItemMeta, PrepKit } from '@prep/core';

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: mongoose.Types.ObjectId };
export const User = mongoose.model('User', userSchema);

const kitSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    inputFingerprint: { type: String, index: true },
    jd: { type: String, required: true },
    companyUrl: { type: String, required: true },
    daysAvailable: { type: Number, required: true },
    status: {
      type: String,
      enum: ['pending', 'generating', 'ready', 'failed', 'partial'],
      default: 'pending',
      index: true,
    },
    progress: {
      step: { type: String, default: 'validating_jd' },
      completedSteps: { type: [String], default: [] },
      errors: { type: [String], default: [] },
      message: { type: String, default: '' },
      updatedAt: { type: Date, default: Date.now },
    },
    content: { type: Schema.Types.Mixed, default: null },
    itemMeta: { type: Schema.Types.Mixed, default: {} },
    practice: {
      cards: { type: Schema.Types.Mixed, default: {} },
    },
    researchMeta: { type: Schema.Types.Mixed, default: {} },
    warnings: { type: [Schema.Types.Mixed], default: [] },
    error: {
      code: String,
      message: String,
    },
    generationLock: { type: Boolean, default: false },
  },
  { timestamps: true },
);

kitSchema.index({ userId: 1, inputFingerprint: 1 });

export type KitDoc = InferSchemaType<typeof kitSchema> & {
  _id: mongoose.Types.ObjectId;
  content: PrepKit | null;
  itemMeta: Record<string, ItemMeta>;
};

export const Kit = mongoose.model('Kit', kitSchema);
