import "./login.css";

function safeNext(value: string | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const error = typeof params.error === "string" ? params.error : "";

  return (
    <main className="loginShell">
      <section className="loginCard">
        <div className="loginBrand">
          <span>CF</span>
          <div>
            <strong>CortiFree</strong>
            <small>Content Operations</small>
          </div>
        </div>
        <div className="loginCopy">
          <p>PRIVATE STUDIO</p>
          <h1>Sign in</h1>
          <span>Use the Supabase account authorized for this workspace.</span>
        </div>
        {error ? <div className="loginError">{error}</div> : null}
        <form action="/api/auth/login" method="post" className="loginForm">
          <input type="hidden" name="next" value={next} />
          <label>
            <span>Email</span>
            <input autoComplete="email" name="email" type="email" required />
          </label>
          <label>
            <span>Password</span>
            <input autoComplete="current-password" name="password" type="password" required />
          </label>
          <button type="submit">Open CortiFree Studio</button>
        </form>
      </section>
    </main>
  );
}
