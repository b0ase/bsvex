import { NextRequest, NextResponse } from "next/server";

interface BurnRequest {
  token: string;
  amount: string;
  bsvAddress: string;
  userAddress: string;
  burnTxHash?: string;
}

interface BurnResponse {
  success: boolean;
  transactionId: string;
  bsvAmount: string;
  status: "pending" | "completed" | "failed";
  message: string;
  bsvTxHash?: string;
}

const EXCHANGE_RATES = {
  ETH: 0.0015,
  SOL: 0.002,
  AVAX: 0.0018,
  TRX: 0.0008,
  BTC: 0.0001
};

export async function POST(request: NextRequest) {
  try {
    const body: BurnRequest = await request.json();
    const { token, amount, bsvAddress, userAddress } = body;

    // Validate input
    if (!token || !amount || !bsvAddress || !userAddress) {
      return NextResponse.json(
        { success: false, message: "Missing required fields" },
        { status: 400 }
      );
    }

    if (!EXCHANGE_RATES[token as keyof typeof EXCHANGE_RATES]) {
      return NextResponse.json(
        { success: false, message: "Unsupported token" },
        { status: 400 }
      );
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return NextResponse.json(
        { success: false, message: "Invalid amount" },
        { status: 400 }
      );
    }

    // Calculate BSV amount
    const exchangeRate = EXCHANGE_RATES[token as keyof typeof EXCHANGE_RATES];
    const bsvAmount = (numAmount * exchangeRate).toFixed(6);

    // Generate transaction ID
    const transactionId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // TODO: Implement actual blockchain integration
    // This would involve:
    // 1. Verifying the burn transaction on the source blockchain
    // 2. Issuing BSV to the provided address
    // 3. Recording the transaction in the database

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // For demo purposes, we'll simulate a successful transaction
    const response: BurnResponse = {
      success: true,
      transactionId,
      bsvAmount,
      status: "completed",
      message: "Token burn successful. BSV has been issued to your address.",
      bsvTxHash: `0x${Math.random().toString(16).substr(2, 64)}`
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error("Burn API error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { message: "Burn API endpoint. Use POST to burn tokens." },
    { status: 200 }
  );
} 