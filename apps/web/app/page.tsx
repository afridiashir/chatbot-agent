const BRANCHES = ["Karachi", "Lahore", "Islamabad", "Peshawar"];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col gap-3">
        <h1 className="text-4xl font-semibold tracking-tight">Acme Corp</h1>
        <p className="text-lg text-neutral-600">
          Serving customers across Pakistan, with a support team in every branch.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {BRANCHES.map((branch) => (
          <span
            key={branch}
            className="rounded-full border border-neutral-200 px-3 py-1 text-sm text-neutral-700"
          >
            {branch}
          </span>
        ))}
      </div>

      <p className="text-sm text-neutral-500">
        Need help? Open the chat in the bottom-right corner, leave your details and pick your
        branch — we will connect you to whoever is free.
      </p>
    </main>
  );
}
