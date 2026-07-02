'use client'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { motion } from 'framer-motion'

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-gradient-to-br dark:from-slate-950 dark:to-slate-900 text-slate-900 dark:text-white">
            {/* Header */}
            <header className="sticky top-0 z-40 bg-white dark:bg-slate-900/80 dark:backdrop-blur border-b border-slate-200 dark:border-slate-800">
                <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Privacy Policy</h1>
                    <Link href="/login" className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <ArrowLeft className="w-4 h-4" />
                        Back
                    </Link>
                </div>
            </header>

            {/* Content */}
            <main className="max-w-4xl mx-auto px-6 py-12">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="prose dark:prose-invert max-w-none"
                >
                    <p className="text-slate-600 dark:text-slate-400 mb-8">
                        <strong>Last Updated:</strong> 21 June 2026 | <strong>Effective Date:</strong> 21 June 2026
                    </p>

                    <h2 className="text-2xl font-bold mt-8 mb-4 text-slate-900 dark:text-white">1. Scope and Application</h2>
                    <p className="text-slate-700 dark:text-slate-300 mb-4">
                        This Privacy Policy explains how the Shadow IT Detection System collects, processes, stores, and protects data. It applies to all Users, including Administrators and Viewers. The System has been developed for academic purposes at the University of Mines and Technology, Tarkwa.
                    </p>

                    <h2 className="text-2xl font-bold mt-8 mb-4 text-slate-900 dark:text-white">2. Data We Collect</h2>

                    <h3 className="text-xl font-semibold mt-6 mb-3 text-slate-800 dark:text-slate-100">2.1 User Account Data</h3>
                    <p className="text-slate-700 dark:text-slate-300 mb-4">
                        When user accounts are created, we collect and store:
                    </p>
                    <ul className="list-disc list-inside space-y-2 text-slate-700 dark:text-slate-300 mb-6">
                        <li>Username and display name</li>
                        <li>Assigned role (Administrator or Viewer)</li>
                        <li>Hashed authentication credentials (passwords are never stored in plain text)</li>
                        <li>Account creation timestamp</li>
                    </ul>

                    <h3 className="text-xl font-semibold mt-6 mb-3 text-slate-800 dark:text-slate-100">2.2 Network Traffic Data</h3>
                    <p className="text-slate-700 dark:text-slate-300 mb-4">
                        The System processes synthetic network traffic data that simulates organisational activity, including:
                    </p>
                    <ul className="list-disc list-inside space-y-2 text-slate-700 dark:text-slate-300 mb-6">
                        <li>Source and destination IP addresses and MAC addresses</li>
                        <li>Domain names and network protocol types (TCP, UDP, HTTPS)</li>
                        <li>Data volumes and connection duration</li>
                        <li>Device type classifications (desktop, laptop, mobile, unknown)</li>
                        <li>Authorisation status of devices and applications</li>
                    </ul>

                    <h3 className="text-xl font-semibold mt-6 mb-3 text-slate-800 dark:text-slate-100">2.3 Audit Log Data</h3>
                    <p className="text-slate-700 dark:text-slate-300 mb-4">
                        We automatically record all administrative actions in the Audit Log, including:
                    </p>
                    <ul className="list-disc list-inside space-y-2 text-slate-700 dark:text-slate-300 mb-6">
                        <li>User identity and role performing the action</li>
                        <li>Type of action performed and resource affected</li>
                        <li>Source IP address and timestamp</li>
                        <li>Outcome of each action (Success or Denied)</li>
                    </ul>

                    <h3 className="text-xl font-semibold mt-6 mb-3 text-slate-800 dark:text-slate-100">2.4 Detection and Anomaly Data</h3>
                    <p className="text-slate-700 dark:text-slate-300 mb-4">
                        The Isolation Forest model generates detection outputs stored in our PostgreSQL database:
                    </p>
                    <ul className="list-disc list-inside space-y-2 text-slate-700 dark:text-slate-300 mb-6">
                        <li>Anomaly scores assigned to network traffic</li>
                        <li>Shadow IT classifications (Hardware or Software)</li>
                        <li>Risk level assignments (Low, Medium, High)</li>
                        <li>Device and service profiles for flagged entities</li>
                    </ul>

                    <h2 className="text-2xl font-bold mt-8 mb-4 text-slate-900 dark:text-white">3. How We Use Data</h2>
                    <p className="text-slate-700 dark:text-slate-300 mb-4">Data is used exclusively for:</p>
                    <ul className="list-disc list-inside space-y-2 text-slate-700 dark:text-slate-300 mb-6">
                        <li>Detecting, classifying, and profiling Shadow IT activities</li>
                        <li>Providing a dashboard for reviewing detection results</li>
                        <li>Maintaining Audit Logs for accountability and forensic investigation</li>
                        <li>Enforcing Role-Based Access Control</li>
                        <li>Supporting academic research and system testing</li>
                    </ul>

                    <h2 className="text-2xl font-bold mt-8 mb-4 text-slate-900 dark:text-white">4. Data Storage and Security</h2>

                    <h3 className="text-xl font-semibold mt-6 mb-3 text-slate-800 dark:text-slate-100">4.1 Storage</h3>
                    <p className="text-slate-700 dark:text-slate-300 mb-4">
                        All data is stored in a PostgreSQL database accessible only through the System&apos;s authenticated Flask REST API backend.
                    </p>

                    <h3 className="text-xl font-semibold mt-6 mb-3 text-slate-800 dark:text-slate-100">4.2 Authentication Security</h3>
                    <p className="text-slate-700 dark:text-slate-300 mb-4">
                        User authentication uses JSON Web Tokens (JWT). Passwords are hashed before storage and never stored in plain text. JWT tokens are time-limited and invalidated upon logout or session expiry.
                    </p>

                    <h3 className="text-xl font-semibold mt-6 mb-3 text-slate-800 dark:text-slate-100">4.3 Access Controls</h3>
                    <p className="text-slate-700 dark:text-slate-300 mb-4">
                        Access is strictly controlled through Role-Based Access Control (RBAC). Only Administrators may access full detection records and user management. Viewers have read-only access to detection summaries.
                    </p>

                    <h3 className="text-xl font-semibold mt-6 mb-3 text-slate-800 dark:text-slate-100">4.4 Audit Log Integrity</h3>
                    <p className="text-slate-700 dark:text-slate-300 mb-4">
                        The Audit Log is maintained as a read-only record within the database. No user may modify or delete audit log entries, ensuring integrity and non-repudiation of all recorded events.
                    </p>

                    <h2 className="text-2xl font-bold mt-8 mb-4 text-slate-900 dark:text-white">5. Data Sharing and Disclosure</h2>
                    <p className="text-slate-700 dark:text-slate-300 mb-4">We do not share data with third parties except:</p>
                    <ul className="list-disc list-inside space-y-2 text-slate-700 dark:text-slate-300 mb-6">
                        <li><strong>Academic Supervision:</strong> With project supervisor and University evaluators for assessment</li>
                        <li><strong>Legal Obligation:</strong> When required by applicable law or court order</li>
                        <li><strong>Security Investigation:</strong> In case of suspected security incidents or policy violations</li>
                    </ul>

                    <h2 className="text-2xl font-bold mt-8 mb-4 text-slate-900 dark:text-white">6. Data Retention</h2>
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 mb-6">
                        <p className="text-slate-700 dark:text-slate-300 mb-2"><strong>User Account Data:</strong> Retained for the project duration</p>
                        <p className="text-slate-700 dark:text-slate-300 mb-2"><strong>Network Traffic Data:</strong> Retained for the evaluation period</p>
                        <p className="text-slate-700 dark:text-slate-300"><strong>Audit Log Records:</strong> Retained indefinitely for forensic and compliance purposes</p>
                    </div>

                    <h2 className="text-2xl font-bold mt-8 mb-4 text-slate-900 dark:text-white">7. User Rights</h2>
                    <p className="text-slate-700 dark:text-slate-300 mb-4">Users have the following rights regarding their data:</p>
                    <ul className="list-disc list-inside space-y-2 text-slate-700 dark:text-slate-300 mb-6">
                        <li><strong>Right of Access:</strong> Request information about personal data held</li>
                        <li><strong>Right to Correction:</strong> Request correction of inaccurate data</li>
                        <li><strong>Right to Erasure:</strong> Request deletion upon project completion</li>
                        <li><strong>Right to Information:</strong> Request summary of data use and sharing</li>
                    </ul>

                    <h2 className="text-2xl font-bold mt-8 mb-4 text-slate-900 dark:text-white">8. Cookies and Tracking</h2>
                    <p className="text-slate-700 dark:text-slate-300 mb-4">
                        The System does not use cookies, web beacons, pixel tags, or any third-party tracking technologies. Session management is handled exclusively through JWT tokens transmitted via secure API calls.
                    </p>

                    <h2 className="text-2xl font-bold mt-8 mb-4 text-slate-900 dark:text-white">9. Children&apos;s Privacy</h2>
                    <p className="text-slate-700 dark:text-slate-300 mb-4">
                        The System is intended for authorised personnel in an academic or organisational context. It is not directed at individuals under 18. If a minor has inadvertently been granted access, that access should be revoked immediately.
                    </p>

                    <h2 className="text-2xl font-bold mt-8 mb-4 text-slate-900 dark:text-white">10. International Data Transfers</h2>
                    <p className="text-slate-700 dark:text-slate-300 mb-4">
                        The System is deployed and operated within the Republic of Ghana. Data is not intentionally transferred outside Ghana. Appropriate safeguards are applied in accordance with applicable data protection law.
                    </p>

                    <h2 className="text-2xl font-bold mt-8 mb-4 text-slate-900 dark:text-white">11. Changes to This Policy</h2>
                    <p className="text-slate-700 dark:text-slate-300 mb-4">
                        We reserve the right to update this Privacy Policy at any time. Users will be notified of material changes through the System dashboard. Continued use following notification constitutes acceptance of the revised policy.
                    </p>

                    <h2 className="text-2xl font-bold mt-8 mb-4 text-slate-900 dark:text-white">12. Contact Information</h2>
                    <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-6 mb-8">
                        <p className="text-slate-700 dark:text-slate-300 mb-2"><strong>Project Team:</strong> Shadow IT Detection System</p>
                        <p className="text-slate-700 dark:text-slate-300 mb-2"><strong>Department:</strong> Cybersecurity and Information Systems</p>
                        <p className="text-slate-700 dark:text-slate-300 mb-2"><strong>Faculty:</strong> Computing and Mathematical Sciences</p>
                        <p className="text-slate-700 dark:text-slate-300 mb-2"><strong>Institution:</strong> University of Mines and Technology, Tarkwa, Ghana</p>
                        <p className="text-slate-700 dark:text-slate-300"><strong>Supervisor:</strong> Dr. Abdel-Fatao Hamidu</p>
                    </div>

                    <p className="text-center text-slate-500 dark:text-slate-400 text-sm mt-12 py-8 border-t border-slate-200 dark:border-slate-800">
                        © 2026 University of Mines and Technology, Tarkwa. All rights reserved.
                    </p>
                </motion.div>
            </main>
        </div>
    )
}
