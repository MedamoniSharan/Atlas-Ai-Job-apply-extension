import mongoose, { Schema, Document, Types } from 'mongoose';

export type PaidPlan = 'pro' | 'max';
export type PaymentStatus = 'created' | 'paid' | 'failed';

export interface IPayment extends Document {
  userId: Types.ObjectId;
  plan: PaidPlan;
  amountPaise: number;
  currency: string;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  status: PaymentStatus;
  invoiceNumber?: string;
  invoicePath?: string;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    plan: { type: String, enum: ['pro', 'max'], required: true },
    amountPaise: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    razorpayOrderId: { type: String, required: true, unique: true },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },
    status: {
      type: String,
      enum: ['created', 'paid', 'failed'],
      default: 'created',
    },
    invoiceNumber: { type: String, unique: true, sparse: true },
    invoicePath: { type: String },
  },
  { timestamps: true }
);

export const PaymentModel = mongoose.model<IPayment>('Payment', paymentSchema);
