import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import { confirmDialog } from './components/Confirm'
import Login from './pages/Login'
import Pos from './pages/Pos'

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
  const [profile, setProfile] = useState(undefined)
  // true while the login page checks the account's branch (the POS must not open yet)
  const [checkingLogin, setCheckingLogin] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => listener.subscription.unsubscribe()
  }, [])

  const userId = session?.user?.id

  useEffect(() => {
    setProfile(undefined)
    if (!userId) return
    supabase
      .from('profiles')
      .select('role, status, branch, full_name')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => setProfile(data ?? null))
  }, [userId])

  if (session === undefined) return <p>Loading...</p>
  if (!session || checkingLogin) return <Login onCheckingChange={setCheckingLogin} />
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

  return <Pos branch={profile.branch} fullName={profile.full_name} />
}
