# BSV Exchange

A modern web application for burning L1 tokens (ETH, SOL, AVAX, TRX, BTC) and receiving BSV in return. Built with Next.js 15, TypeScript, and Tailwind CSS.

## Features

- **Multi-Chain Support**: Burn tokens from Ethereum, Solana, Avalanche, TRON, and Bitcoin
- **Real-Time Exchange**: Instant BSV issuance upon successful token burns
- **Transaction History**: Track all your burns and BSV receipts
- **Modern UI**: Beautiful, responsive design with dark theme
- **Security**: Secure token burning with proper validation
- **Real-Time Stats**: Live exchange statistics and recent activity

## Supported Tokens

| Token | Symbol | Exchange Rate | Burn Address |
|-------|--------|---------------|--------------|
| Ethereum | ETH | 0.0015 BSV | 0x000000000000000000000000000000000000dEaD |
| Solana | SOL | 0.0020 BSV | 11111111111111111111111111111112 |
| Avalanche | AVAX | 0.0018 BSV | 0x000000000000000000000000000000000000dEaD |
| TRON | TRX | 0.0008 BSV | T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb |
| Bitcoin | BTC | 0.0001 BSV | 1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2 |

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **Styling**: Tailwind CSS, Radix UI
- **Blockchain**: Web3.js, Solana Web3.js, TronWeb
- **Icons**: Lucide React
- **Deployment**: Vercel (recommended)

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Git

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/bsvex.git
cd bsvex
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

Add your environment variables:
```env
# Blockchain RPC URLs
ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/YOUR_PROJECT_ID
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
TRON_RPC_URL=https://api.trongrid.io

# Supabase (for database)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# BSV Network
BSV_RPC_URL=your_bsv_rpc_url
BSV_PRIVATE_KEY=your_bsv_private_key
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   └── exchange/      # Exchange API endpoints
│   ├── history/           # Transaction history page
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Home page
├── components/            # React components
│   ├── Header.tsx         # Navigation header
│   ├── TokenBurnForm.tsx  # Main exchange form
│   ├── Stats.tsx          # Statistics display
│   ├── TransactionHistory.tsx # Transaction history
│   └── Footer.tsx         # Site footer
└── lib/                   # Utility libraries
    └── services/          # Service classes
        └── blockchain.ts  # Blockchain integration
```

## API Endpoints

### POST /api/exchange/burn

Burn tokens and receive BSV.

**Request Body:**
```json
{
  "token": "ETH",
  "amount": "2.5",
  "bsvAddress": "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
  "userAddress": "0x1234...",
  "burnTxHash": "0xabcd..." // Optional
}
```

**Response:**
```json
{
  "success": true,
  "transactionId": "tx_1234567890_abc123",
  "bsvAmount": "0.00375",
  "status": "completed",
  "message": "Token burn successful. BSV has been issued to your address.",
  "bsvTxHash": "0x9876543210..."
}
```

## Development

### Code Style

- Use TypeScript for all code
- Follow ESLint configuration
- Use Prettier for formatting
- Write meaningful commit messages

### Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Building for Production

```bash
# Build the application
npm run build

# Start production server
npm start
```

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Set environment variables in Vercel dashboard
4. Deploy automatically on push to main branch

### Other Platforms

The application can be deployed to any platform that supports Next.js:

- Netlify
- Railway
- DigitalOcean App Platform
- AWS Amplify

## Security Considerations

- **Private Keys**: Never expose private keys in client-side code
- **Input Validation**: All user inputs are validated server-side
- **Rate Limiting**: Implement rate limiting on API endpoints
- **HTTPS**: Always use HTTPS in production
- **Environment Variables**: Keep sensitive data in environment variables

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- Email: support@bsvexchange.com
- Telegram: [@bsvexchange](https://t.me/bsvexchange)
- Twitter: [@bsvexchange](https://twitter.com/bsvexchange)

## Disclaimer

This software is provided "as is" without warranty. Token burning is irreversible. Always double-check addresses and amounts before proceeding with any transactions.
