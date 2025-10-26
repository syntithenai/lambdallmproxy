import { useNavigate } from 'react-router-dom';

export function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Back to Chat"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Privacy Policy</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6 text-gray-800 dark:text-gray-200">
          <section className="space-y-4">
            <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">📅 Last Updated</h3>
            <p>October 26, 2025</p>
          </section>

          <section className="space-y-4">
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Welcome to Our Privacy Policy</h3>
            <p>
              We believe transparency is essential when it comes to your personal information. This privacy policy explains clearly and honestly what data we collect when you use Research Agent, how we use it, who we share it with, and what rights you have over your information.
            </p>
            <p>
              Research Agent is designed with privacy as a core principle. We minimize data collection, store most of your content locally on your device, and never sell your personal information to third parties. Let's walk through exactly how we handle your data.
            </p>
          </section>

          <section className="space-y-4">
            <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🔒 What Information Do We Collect?</h3>
            <p>When you use Research Agent, we collect only what's necessary to provide and improve our service:</p>
            
            <p>
              <strong>Authentication Information:</strong> We use Google OAuth to verify your identity, which means we receive your email address and basic profile information (like your name and profile picture). This helps us secure your account and personalize your experience.
            </p>
            
            <p>
              <strong>Your Conversations:</strong> The messages you send to AI models and their responses are stored locally in your browser's storage—not on our servers. This keeps your conversations private and under your control. Only you can access them through your authenticated account.
            </p>
            
            <p>
              <strong>Usage and Billing Data:</strong> We track which AI models you use, how many tokens you consume, the costs associated with your requests, and when you make them. This information is essential for billing purposes and helps you understand your spending. When you purchase credits through PayPal, we record the transaction ID, amount, and your current balance.
            </p>
            
            <p>
              <strong>Content You Create:</strong> If you use our content management features (called "Swag"), your snippets, notes, embeddings, and tags are stored locally in your browser's IndexedDB database. You can optionally sync this content to your personal Google Drive for backup and access across devices.
            </p>
            
            <p>
              <strong>Optional Information:</strong> Some features work better with additional data that you can choose to provide. If you grant permission, we may access your location for location-based queries, or connect to your Google Drive for cloud synchronization. These are entirely optional—the service works without them.
            </p>
          </section>

          <section className="space-y-4">
            <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🎯 How Do We Use Your Information?</h3>
            <p>Every piece of information we collect serves a specific purpose:</p>
            
            <p>
              <strong>Providing the Service:</strong> We use your authentication data to verify who you are and keep your account secure. When you ask a question or make a request, we route it to the AI provider you've selected (like OpenAI, Google, or Groq), including the necessary context to get you a helpful response.
            </p>
            
            <p>
              <strong>Managing Your Account:</strong> Your billing information helps us track your credit balance, process payments through PayPal, and generate transparent transaction records so you always know where your money is going. This financial visibility is important—you should never wonder what you're being charged for.
            </p>
            
            <p>
              <strong>Improving the Service:</strong> We analyze aggregated usage patterns (without identifying individual users) to monitor performance, identify and fix bugs, and optimize our infrastructure for better speed and reliability. When something breaks or could work better, this data helps us fix it.
            </p>
            
            <p>
              <strong>Communicating With You:</strong> If we need to send important service updates, security alerts, or respond to your support requests, we'll use your email address. We don't send marketing emails or spam—just essential service information.
            </p>
          </section>

          <section className="space-y-4">
            <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🤝 Who Do We Share Your Data With?</h3>
            <p>To provide Research Agent's functionality, we work with several trusted partners:</p>
            
            <p>
              <strong>AI Service Providers:</strong> When you send a prompt, it goes to the AI provider you've selected—OpenAI, Google, Anthropic, Groq, or others. Your conversation history is shared with these providers so they can generate relevant responses. Each provider has their own privacy policy that governs how they handle your data. We recommend reviewing their policies to understand how your prompts are processed and whether they're used for training.
            </p>
            
            <p>
              <strong>Payment Processor:</strong> All financial transactions are handled directly by PayPal. When you buy credits, PayPal processes your payment according to their privacy policy. We never see or store your credit card numbers, bank account information, or other sensitive financial details. We only receive confirmation that the payment succeeded and the transaction ID for our records.
            </p>
            
            <p>
              <strong>Cloud Infrastructure:</strong> Our backend runs on Amazon Web Services (AWS) Lambda, which hosts the code that processes your requests and manages routing to AI providers. AWS is a secure, enterprise-grade cloud platform trusted by millions of applications worldwide.
            </p>
            
            <p>
              <strong>Your Personal Cloud Storage:</strong> If you enable Google Drive synchronization, your content travels directly from your browser to your own Google Drive account. We don't maintain copies on our servers—the data goes straight to storage you control.
            </p>
            
            <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-200 dark:border-red-800">
              <p className="font-semibold text-red-800 dark:text-red-200 mb-2">⚠️ What We DON'T Do</p>
              <p className="text-sm">
                We do NOT sell your personal information to advertisers, data brokers, or marketing companies. We do NOT share your conversations or content with third parties for purposes unrelated to providing you the service. Your data is used solely to give you the AI assistance you signed up for, nothing more.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🔐 How We Protect and Store Your Data</h3>
            
            <p>
              <strong>Privacy-First Architecture:</strong> Research Agent is built around a simple principle: your private data should stay private. The majority of your content—your complete chat history, all your saved snippets, and generated embeddings—never leaves your device. It's stored exclusively in your browser's local IndexedDB database, which means it stays on your computer or phone unless you explicitly choose to back it up to your Google Drive.
            </p>
            
            <p>
              <strong>What Lives on Our Servers:</strong> The only information we store on our backend infrastructure is billing-related: your transaction history, credit purchases, and usage logs. We keep this for accounting purposes and to ensure billing transparency. This data is stored securely with appropriate access controls and encryption.
            </p>
            
            <p>
              <strong>Data Security:</strong> All communication between your browser and our servers is encrypted using HTTPS, the same technology that protects online banking. Your authentication happens through Google's OAuth2 system, which means we never see your Google password. Access to your personal data is restricted to you alone through your authenticated Google account—not even administrators can peek at your conversations or content.
            </p>
            
            <p>
              <strong>How Long We Keep Data:</strong> Billing records are retained as required by law for tax and accounting compliance. Your chat history and content are stored locally in your browser, so they persist until you choose to delete them. You're always in control—clear your data whenever you want through the app or your browser's storage settings.
            </p>
          </section>

          <section className="space-y-4">
            <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🛡️ Your Rights and Control</h3>
            <p>You have meaningful control over your information:</p>
            
            <p>
              <strong>Access Your Data:</strong> View your complete billing history and detailed usage statistics anytime through the Billing page. See exactly what you've been charged for, when, and how many credits you have remaining.
            </p>
            
            <p>
              <strong>Delete Your Data:</strong> Because your conversations and content live in your browser, you can delete them whenever you choose. Use the app's clear data features or your browser's storage management tools. It's truly deleted—we can't recover it because we never had a copy.
            </p>
            
            <p>
              <strong>Export Your Data:</strong> Download your transaction history and usage data for your own records or to move to another service. Your data isn't locked in—you can take it with you.
            </p>
            
            <p>
              <strong>Control Optional Features:</strong> Turn off Google Drive sync to keep content local-only. Revoke location access if you no longer want location-based features. Close your account entirely if you no longer wish to use Research Agent.
            </p>
          </section>

          <section className="space-y-4">
            <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">⚠️ Important Disclaimers and Limitations</h3>
            <div className="bg-yellow-50 dark:bg-yellow-900/20 p-5 rounded-lg border-2 border-yellow-300 dark:border-yellow-700 space-y-4">
              
              <p>
                <strong className="text-yellow-800 dark:text-yellow-200">Understanding AI-Generated Content:</strong> The responses you receive from AI models are generated by sophisticated artificial intelligence, but they're not perfect. AI can make mistakes, exhibit biases from training data, provide outdated information, or even "hallucinate"—confidently presenting false information as fact. AI-generated content may also include inappropriate, offensive, or potentially harmful material.
              </p>
              
              <p>
                <strong className="text-yellow-800 dark:text-yellow-200">No Warranties:</strong> We provide Research Agent "as is" without guarantees of any kind. We don't warrant that the AI responses will be accurate, complete, safe, or suitable for any particular purpose. The service may have bugs, experience downtime, or not work as expected.
              </p>
              
              <p>
                <strong className="text-yellow-800 dark:text-yellow-200">Your Responsibility:</strong> You are solely responsible for verifying information before acting on it. This is especially critical for important decisions involving health, legal matters, financial planning, safety, or anything consequential. When it matters, consult qualified professionals rather than relying on AI alone.
              </p>
              
              <p>
                <strong className="text-yellow-800 dark:text-yellow-200">Third-Party Services:</strong> We're not responsible for issues with OpenAI, Google, Groq, PayPal, or other integrated services. Their performance, availability, and policies are beyond our control. Problems with these services are governed by their own terms and privacy policies.
              </p>
              
              <p>
                <strong className="text-yellow-800 dark:text-yellow-200">Data Loss:</strong> While we implement reasonable protections, we can't guarantee against data loss. We're not liable for lost chat history, content, or other browser-stored data due to cache clearing, device failure, software conflicts, or any other cause. Back up anything important to external storage.
              </p>
              
              <p>
                <strong className="text-yellow-800 dark:text-yellow-200">Liability Limits:</strong> To the maximum extent permitted by law, our total liability for all claims will not exceed what you've paid us for credits in the past 30 days. We're not liable for indirect damages, lost profits, or consequential losses.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🔄 Changes to This Policy</h3>
            <p>
              As Research Agent evolves and legal requirements change, we may update this privacy policy. When we make significant changes affecting your rights or our data practices, we'll notify you prominently in the app and update the "Last Updated" date above. We encourage you to review this policy periodically. Continued use after changes means you accept the updated terms.
            </p>
          </section>

          <section className="space-y-4">
            <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">📧 Contact Us</h3>
            <p>We're here to answer your questions and address your concerns:</p>
            
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800 space-y-3">
              <div className="border-l-4 border-blue-500 pl-4">
                <p className="font-semibold text-blue-700 dark:text-blue-300">Email Support</p>
                <p className="text-sm mb-1">For privacy questions, general inquiries, or billing issues:</p>
                <a href="mailto:syntithenai@gmail.com" className="text-blue-600 dark:text-blue-400 hover:underline text-sm">
                  syntithenai@gmail.com
                </a>
              </div>
              
              <div className="border-l-4 border-purple-500 pl-4">
                <p className="font-semibold text-purple-700 dark:text-purple-300">Bug Reports & Feature Requests</p>
                <p className="text-sm mb-1">For technical issues, bug reports, or feature suggestions:</p>
                <button
                  onClick={() => window.open('https://github.com/syntithenai/lambdallmproxy/issues', '_blank')}
                  className="text-purple-600 dark:text-purple-400 hover:underline text-sm"
                >
                  GitHub Issues →
                </button>
              </div>
            </div>
            
            <p className="text-sm text-gray-600 dark:text-gray-400">
              We typically respond within a few business days. For urgent billing or account issues, mark your message as "URGENT."
            </p>
          </section>

          <div className="bg-blue-50 dark:bg-blue-900/20 p-5 rounded-lg border-2 border-blue-300 dark:border-blue-700">
            <p className="font-semibold text-lg mb-2 text-blue-900 dark:text-blue-100">Your Consent</p>
            <p className="text-sm">
              By using Research Agent, you confirm that you've read and understood this privacy policy, agree to its terms including the disclaimers and liability limitations, and understand both the capabilities and limitations of AI technology. If you don't agree with any part of this policy, please don't use the service.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
