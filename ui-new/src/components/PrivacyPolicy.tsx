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
            <p>October 24, 2025</p>
          </section>

          <section className="space-y-4">
            <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🔒 Information We Collect</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Authentication Data:</strong> Google OAuth tokens, email address, profile information
              </li>
              <li>
                <strong>Usage Data:</strong> API requests, model selections, token counts, costs, timestamps
              </li>
              <li>
                <strong>Chat History:</strong> Messages sent to and from LLM providers (stored locally in your browser)
              </li>
              <li>
                <strong>Billing Data:</strong> PayPal transaction IDs, purchase amounts, credit balances (logged to Google Sheets)
              </li>
              <li>
                <strong>Content Data:</strong> SWAG snippets, embeddings, tags (stored locally in IndexedDB, optionally synced to your Google Drive)
              </li>
              <li>
                <strong>Optional Data:</strong> Location (if you grant permission), Google Drive file access (if you use sync features)
              </li>
            </ul>
          </section>

          <section className="space-y-4">
            <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🎯 How We Use Your Information</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Authentication:</strong> Verify your identity and provide access to the service</li>
              <li><strong>API Routing:</strong> Forward your requests to selected LLM providers</li>
              <li><strong>Billing:</strong> Track credit usage, process payments, generate transaction records</li>
              <li><strong>Service Improvement:</strong> Monitor performance, debug issues, optimize infrastructure</li>
              <li><strong>Communication:</strong> Send service updates or respond to support requests</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🤝 Data Sharing</h3>
            <p>We share your data with:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>LLM Providers:</strong> Your prompts and chat history are sent to OpenAI, Google, Groq, or other providers you select
              </li>
              <li>
                <strong>Payment Processors:</strong> PayPal handles payment processing (subject to their privacy policy)
              </li>
              <li>
                <strong>Cloud Services:</strong> AWS Lambda hosts our backend, Google Sheets stores billing logs
              </li>
              <li>
                <strong>Your Google Drive:</strong> If you enable sync, content is saved to your personal Google Drive
              </li>
            </ul>
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded border border-red-200 dark:border-red-800">
              ⚠️ <strong>Important:</strong> We do NOT sell or rent your personal information to third parties for marketing purposes.
            </p>
          </section>

          <section className="space-y-4">
            <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🔐 Data Storage & Security</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Local Storage:</strong> Chat history, SWAG content, and embeddings are stored in your browser's IndexedDB</li>
              <li><strong>Cloud Storage:</strong> Billing transactions logged to Google Sheets in your Google Drive</li>
              <li><strong>Encryption:</strong> HTTPS for all data transmission, OAuth2 for authentication</li>
              <li><strong>Access Control:</strong> Only you can access your personal data (via Google authentication)</li>
              <li><strong>Retention:</strong> We retain billing logs for accounting purposes; chat history is stored locally and you can delete it anytime</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🛡️ Your Privacy Rights</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Access:</strong> View your billing transactions and usage data</li>
              <li><strong>Deletion:</strong> Clear your local chat history and SWAG content anytime</li>
              <li><strong>Portability:</strong> Export your data from Google Sheets</li>
              <li><strong>Opt-Out:</strong> Disconnect Google Drive sync, disable location access, or close your account</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">⚠️ Disclaimer of Liability</h3>
            <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <p className="font-semibold mb-2">IMPORTANT - PLEASE READ CAREFULLY:</p>
              <ul className="list-disc pl-6 space-y-2 text-sm">
                <li>
                  <strong>AI-Generated Content:</strong> Responses from LLM providers are generated by artificial intelligence and may contain errors, biases, or inappropriate content.
                </li>
                <li>
                  <strong>No Warranties:</strong> We provide the service "AS IS" without warranties of any kind, express or implied.
                </li>
                <li>
                  <strong>No Responsibility:</strong> We are NOT responsible for the accuracy, completeness, safety, or legality of AI-generated outputs.
                </li>
                <li>
                  <strong>User Responsibility:</strong> YOU are responsible for verifying any information before acting on it.
                </li>
                <li>
                  <strong>Third-Party Services:</strong> We are not liable for issues with OpenAI, Google, Groq, PayPal, or other third-party services.
                </li>
                <li>
                  <strong>Data Loss:</strong> We are not responsible for loss of local data (chat history, SWAG content) due to browser issues, cache clearing, or device failure.
                </li>
                <li>
                  <strong>Limitation of Liability:</strong> Our total liability shall not exceed the amount you paid for credits in the past 30 days.
                </li>
              </ul>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🔄 Changes to This Policy</h3>
            <p>
              We may update this privacy policy from time to time. We will notify you of significant changes by 
              posting a notice in the application or updating the "Last Updated" date above.
            </p>
          </section>

          <section className="space-y-4">
            <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">📧 Contact Us</h3>
            <p>
              If you have questions about this privacy policy or your data, please contact us via GitHub issues 
              at the project repository.
            </p>
          </section>

          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800 mt-6">
            <p className="text-sm font-medium">
              By using LLM Proxy, you acknowledge that you have read, understood, and agree to this privacy policy 
              and disclaimer of liability.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
