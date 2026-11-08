import { lazy, Suspense, useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import { confirmDialog } from './lib/dialogs'

// each screen's code downloads only when it is first shown
const Login = lazy(() => import('./pages/Login'))
const Pos = lazy(() => import('./pages/Pos'))
const LOADING = <p>Loading...</p>

function StatusScreen({ title, text }) {
  return (
    <div className="mt-20 text-center">
      <h2>{title}</h2>
      <p>{text}</p>
      <button
        onClick={async () => {
          if (await confirmDialog('Are you sure you want to log out?')) supabase.auth.signOut()
        }}
      >
        Log out
      </button>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined)
  // the profile, with the user it was loaded for (undefined while loading)
  const [loaded, setLoaded] = useState({ userId: null, profile: undefined })
  // true while the login page checks the account's branch (the POS must not open yet)
  const [checkingLogin, setCheckingLogin] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => listener.subscription.unsubscribe()
  }, [])

  const userId = session?.user?.id

  useEffect(() => {
    if (!userId) return
    let live = true
    supabase
      .from('profiles')
      .select('role, status, branch, full_name')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => live && setLoaded({ userId, profile: data ?? null }))
    return () => {
      live = false
    }
  }, [userId])
  const profile = loaded.userId === userId ? loaded.profile : undefined

  if (session === undefined) return <p>Loading...</p>
  if (!session || checkingLogin) {
    return (
      <Suspense fallback={LOADING}>
        <Login onCheckingChange={setCheckingLogin} />
      </Suspense>
    )
  }
  if (profile === undefined) return <p>Loading...</p>

  if (!profile) return <StatusScreen title="Profile not found" text="Please log out and try again." />
  if (profile.status !== 'approved') {
    return <StatusScreen title="Account not approved" text="Please ask the admin to approve your account." />
  }
  if (profile.role !== 'staff' && profile.role !== 'manager') {
    return (
      <StatusScreen
        title="The POS is for branch staff"
        text="Please log in with a branch staff account. Admins use the admin portal."
      />
    )
  }
  if (!profile.branch) return <StatusScreen title="No branch assigned" text="Please contact the admin." />

  return (
    <Suspense fallback={LOADING}>
      <Pos branch={profile.branch} fullName={profile.full_name} />
    </Suspense>
  )
}
