import mongoose, { Schema, Document, Types } from 'mongoose';

export type PaidPlan = 'pro' | 'max';
export type PaymentStatus = 'created' | 'paid' | 'failed';
export type PaymentType = 'order' | 'subscription' | 'admin';

export interface IPayment extends Document {
  userId: Types.ObjectId;
  plan: PaidPlan;
  amountPaise: number;
  currency: string;
  type: PaymentType;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  razorpaySubscriptionId?: string;
  razorpayInvoiceId?: string;
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
    type: {
      type: String,
      enum: ['order', 'subscription', 'admin'],
      default: 'order',
    },
    razorpayOrderId: { type: String, unique: true, sparse: true },
    razorpayPaymentId: { type: String, index: true },
    razorpaySignature: { type: String },
    razorpaySubscriptionId: { type: String, index: true },
    razorpayInvoiceId: { type: String },
    status: {
      type: String,
      enum: ['created', 'paid', 'failed'],
      default: 'created',
      index: true,
    },
    invoiceNumber: { type: String, unique: true, sparse: true },
    invoicePath: { type: String },
  },
  { timestamps: true }
);

export const PaymentModel = mongoose.model<IPayment>('Payment', paymentSchema);
