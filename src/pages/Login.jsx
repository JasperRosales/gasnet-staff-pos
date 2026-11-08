import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { BRANCHES, branchName } from '../lib/branches'
import { EMAIL_DOMAIN } from '../lib/accountRules'
import { alertDialog } from '../components/Confirm'
import { useAddress, go, branchSlug, branchOfSlug } from '../lib/address'

export const WEBSITE_URL = 'https://towngaz-web.vercel.app/' // the customer website

const GREEN = '#0b4436' // the panel and the buttons
const RED = '#d4111b' // the stripe along the wave

// how wide the green panel is: on the branch screen, then after a branch is chosen
const PANEL_BRANCH = '64%'
const PANEL_LOGIN = '50%'
const SLIDE = 'transition-all duration-700 ease-[cubic-bezier(0.65,0,0.35,1)]'

const ICONS = {
  pin: 'M12 22s-7-7.5-7-12.5a7 7 0 0 1 14 0C19 14.5 12 22 12 22zM12 12.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  chevron: 'M9 6l6 6-6 6',
  store: 'M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3M9 20v-5h6v5',
  user: 'M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4M12 15v2',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  arrow: 'M5 12h14M13 6l6 6-6 6',
}

function Icon({ name, className = 'size-5' }) {
  return (
    <svg
      className={`${className} shrink-0`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  )
}

// the right edge of the green panel: a wave with a white and a red stripe
const WAVE = 'M40 0 C85 170 0 330 40 500 C80 670 -5 830 40 1000'

function Wave() {
  return (
    <svg
      className="pointer-events-none absolute top-0 right-0 h-full w-[90px] translate-x-[calc(100%-1px)] max-[900px]:hidden"
      viewBox="0 0 90 1000"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={`${WAVE} L0 1000 L0 0 Z`} fill={GREEN} />
      <path d={WAVE} transform="translate(9 0)" fill="none" stroke="#fff" strokeWidth="10" vectorEffect="non-scaling-stroke" />
      <path d={WAVE} transform="translate(19 0)" fill="none" stroke={RED} strokeWidth="9" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

const INPUT_BOX =
  'flex items-center gap-3 rounded-xl border border-gray-300 bg-white px-4 text-gray-500 focus-within:border-[#0b4436]'
const INPUT = 'min-w-0 flex-1 border-0 bg-transparent px-0 py-3.5 text-[15px] text-gray-900 outline-none'

// Staff portal login: choose the branch first, then the green panel slides to the left
// and the login form appears on the right. A staff account can only log in on its own branch.
// Accounts are made by the admin (Manage account), so there is no sign-up here.
// onCheckingChange(true) keeps the portal closed while the account's branch is checked.
export default function Login({ onCheckingChange = () => {} }) {
  // the screen comes from the address: "/" choose a branch, "/login/caloocan" or "/login/admin" the form
  // (so the browser's Back goes from the form to the branches instead of leaving the site)
  const path = useAddress()
  const loginFor = /^\/login\/([a-z0-9-]+)$/.exec(path)?.[1] ?? null
  const isAdminLogin = loginFor === 'admin'
  const branch = isAdminLogin ? null : branchOfSlug(loginFor)
  const stage = isAdminLogin || branch ? 'login' : 'branch' // branch | login
  // Staff or Admin: from the address, unless the Staff / Admin switch was clicked on this screen
  const [typeChoice, setTypeChoice] = useState(null) // { for: loginFor, type }
  const accountType =
    typeChoice?.for === loginFor ? typeChoice.type : isAdminLogin ? 'admin' : 'staff' // staff | admin
  const setAccountType = (type) => setTypeChoice({ for: loginFor, type })

  // an address that is not a login screen (for example a page of the portal after logging out)
  useEffect(() => {
    if (stage === 'branch' && path !== '/') go('/', true)
  }, [path, stage])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [warning, setWarning] = useState(null) // { text, branch } when the login was stopped
  const [loading, setLoading] = useState(false)

  const onBranchScreen = stage === 'branch'

  const chooseBranch = (id) => {
    go(`/login/${branchSlug(id)}`)
    setMessage('')
    setWarning(null)
  }

  const adminLogin = () => {
    go('/login/admin')
    setMessage('')
    setWarning(null)
  }

  const backToBranches = () => {
    setMessage('')
    setWarning(null)
    go('/')
  }

  // "juan" -> "juan@towngaz.com"; a full email is used as it is
  const emailOf = (name) => {
    const text = name.trim().toLowerCase()
    return text.includes('@') ? text : text + EMAIL_DOMAIN
  }

  // a reason this account cannot log in here (wrong branch or wrong tab), or null
  const loginProblem = (profile) => {
    if (!profile) return null // the portal shows "Profile not found"
    if (accountType === 'admin') {
      return profile.role === 'admin'
        ? null
        : { text: 'This is not an admin account. Use the Staff tab and choose your branch.' }
    }
    if (profile.role === 'staff' || profile.role === 'manager') {
      if (!profile.branch || Number(profile.branch) === branch) return null
      const own = branchName(profile.branch)
      return {
        text: `This account belongs to the ${own} branch. Please choose ${own} and log in there.`,
        branch: Number(profile.branch),
      }
    }
    return null // admin (any branch) and customers are handled by the portal
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setMessage('')
    setWarning(null)
    if (accountType === 'staff' && !branch) {
      setWarning({ text: 'Please choose your branch first.' })
      return
    }

    setLoading(true)
    onCheckingChange(true) // the portal stays closed until the branch is checked
    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailOf(username),
      password,
    })
    if (error) {
      setLoading(false)
      onCheckingChange(false)
      setMessage(error.message)
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, branch')
      .eq('id', data.user.id)
      .maybeSingle()
    // a customer account: log out and point them to the customer website (stay on this page)
    if (profile?.role === 'customer') {
      await supabase.auth.signOut()
      setLoading(false)
      onCheckingChange(false)
      await alertDialog(
        <>
          Customer accounts cannot log in to the staff portal. Please order on the Towngaz website:
          <br />
          <a href={WEBSITE_URL} target="_blank" rel="noreferrer" className="font-semibold break-all">
            towngaz-web.vercel.app
          </a>
        </>,
        'This is the staff portal'
      )
      return
    }

    const problem = loginProblem(profile)
    if (problem) {
      await supabase.auth.signOut()
      setWarning(problem)
    }
    setLoading(false)
    onCheckingChange(false)
  }

  // "Go to <branch>" in the warning: switch to the right branch, keep what was typed
  const switchBranch = (id) => {
    go(`/login/${branchSlug(id)}`, true)
    setWarning(null)
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-white font-[Poppins,system-ui,sans-serif]">
      {/* ---- the green panel (left) ---- */}
      <div
        className={`absolute top-0 bottom-0 left-0 z-10 ${SLIDE} max-[900px]:w-full! ${
          onBranchScreen ? '' : 'max-[900px]:h-40'
        }`}
        style={{
          width: onBranchScreen ? PANEL_BRANCH : PANEL_LOGIN,
          background: `radial-gradient(circle at 0% 0%, #0f5747 0, transparent 35%), radial-gradient(circle at 10% 100%, #0f5747 0, transparent 30%), ${GREEN}`,
        }}
      >
        <Wave />

        {/* the round button on the wave: admin login on the branch screen, back to the branches after */}
        <button
          type="button"
          onClick={onBranchScreen ? adminLogin : backToBranches}
          title={onBranchScreen ? 'Admin login' : 'Choose another branch'}
          aria-label={onBranchScreen ? 'Admin login' : 'Choose another branch'}
          className="absolute top-1/2 right-0 z-20 flex size-14 translate-x-[calc(50%+40px)] -translate-y-1/2 items-center justify-center rounded-full border-4 border-white p-0 text-white shadow-lg hover:scale-105 hover:opacity-100 max-[900px]:hidden"
          style={{ background: GREEN }}
        >
          <Icon
            name="chevron"
            className={`size-6 transition-transform duration-500 ${onBranchScreen ? '' : 'rotate-180'}`}
          />
        </button>

        {/* the cylinders, shown with the login form */}
        <img
          src="/login-tanks.png"
          alt=""
          // the picture has an empty strip on the left and bottom and a small mark on the right edge
          style={{ clipPath: 'inset(0 4% 2% 2%)' }}
          className={`pointer-events-none absolute bottom-0 left-0 h-[68%] w-auto max-w-none -translate-x-[2%] translate-y-[2%] transition-opacity duration-700 max-[900px]:hidden ${
            onBranchScreen ? 'opacity-0' : 'opacity-100 delay-300'
          }`}
        />

        <div className="relative box-border flex h-full flex-col px-[8%] pt-[7vh] max-[900px]:px-6 max-[900px]:pt-6">
          {/* the logo picture has empty space above and below it: only its middle is shown */}
          <div
            className={`aspect-[3464/720] w-full max-w-[460px] shrink-0 overflow-hidden ${
              onBranchScreen ? '' : 'max-[900px]:max-w-[260px]'
            }`}
          >
            <img
              src="/cjg-logo.png"
              alt="CJG Joseph and Norie Trading"
              className="mt-[-17.6%] block h-auto w-full max-w-none"
            />
          </div>
          <p
            className={`mt-1 mb-0 pl-[17%] text-[clamp(10px,1.1vw,14px)] tracking-[0.3em] text-white/90 ${
              onBranchScreen ? '' : 'max-[900px]:hidden'
            }`}
          >
            SAFE LPG. RELIABLE SERVICE.
          </p>

          {/* the branches: they slide away when one is chosen */}
          <div
            className={`mt-[6vh] max-w-[720px] ${SLIDE} ${
              onBranchScreen
                ? 'translate-x-0 opacity-100'
                : 'pointer-events-none -translate-x-24 opacity-0 max-[900px]:hidden'
            } max-[900px]:min-h-0 max-[900px]:flex-1 max-[900px]:overflow-y-auto max-[900px]:pb-6`}
            aria-hidden={!onBranchScreen}
          >
            <div className="flex items-center gap-3 text-white">
              <Icon name="store" className="size-9" />
              <h1 className="m-0 text-[clamp(24px,2.6vw,36px)] font-bold text-white">Staff POS</h1>
            </div>
            <p className="mt-1 mb-0 text-[15px] text-white/80">Select your branch to continue</p>
            <div className="mt-3 mb-6 h-1 w-12 rounded-full" style={{ background: RED }} />

            <div className="grid grid-cols-2 gap-4 max-[560px]:grid-cols-1">
              {BRANCHES.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  tabIndex={onBranchScreen ? 0 : -1}
                  onClick={() => chooseBranch(b.id)}
                  className="flex items-center gap-3 rounded-xl bg-white px-5 py-4 text-left text-[16px] font-semibold shadow-md hover:-translate-y-0.5 hover:opacity-100 hover:shadow-lg"
                  style={{ color: GREEN }}
                >
                  <Icon name="pin" className="size-6" />
                  <span className="flex-1">{b.name}</span>
                  <Icon name="chevron" />
                </button>
              ))}
            </div>

            <button
              type="button"
              tabIndex={onBranchScreen ? 0 : -1}
              onClick={adminLogin}
              className="mt-6 bg-transparent p-0 text-[14px] text-white/80 underline hover:text-white"
            >
              Admin? Log in here
            </button>
          </div>
        </div>
      </div>

      {/* ---- the login form (right) ---- */}
      <div
        className={`absolute top-0 right-0 bottom-0 box-border flex w-1/2 items-center justify-center overflow-y-auto px-8 py-10 transition-opacity duration-500 max-[900px]:top-40 max-[900px]:w-full max-[900px]:items-start max-[900px]:px-6 ${
          onBranchScreen ? 'pointer-events-none opacity-0' : 'opacity-100 delay-500'
        }`}
        aria-hidden={onBranchScreen}
      >
        <div className="w-full max-w-[430px]">
          <form onSubmit={handleLogin} className="grid gap-4">
              {/* Staff / Admin */}
              <div className="grid grid-cols-2 rounded-xl border border-gray-200 bg-gray-100 p-1">
                {[
                  { key: 'staff', label: 'Staff', icon: 'user' },
                  { key: 'admin', label: 'Admin', icon: 'shield' },
                ].map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    tabIndex={onBranchScreen ? -1 : 0}
                    onClick={() => setAccountType(t.key)}
                    className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-[15px] font-medium ${
                      accountType === t.key ? 'text-white shadow' : 'bg-transparent text-gray-500'
                    }`}
                    style={accountType === t.key ? { background: GREEN } : undefined}
                  >
                    <Icon name={t.icon} />
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="mt-4">
                <h2 className="m-0 text-[26px] font-bold text-gray-900">Welcome Back,</h2>
                <p className="mt-1 mb-0 text-[15px] text-gray-500">
                  Log in to your {accountType} account
                  {accountType === 'staff' && branch ? ` · ${branchName(branch)} branch` : ''}
                </p>
              </div>

              <label className={INPUT_BOX}>
                <Icon name="user" />
                <input
                  className={INPUT}
                  placeholder="Username"
                  autoCapitalize="none"
                  autoComplete="username"
                  tabIndex={onBranchScreen ? -1 : 0}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </label>

              <label className={INPUT_BOX}>
                <Icon name="lock" />
                <input
                  className={INPUT}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  autoComplete="current-password"
                  tabIndex={onBranchScreen ? -1 : 0}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  tabIndex={onBranchScreen ? -1 : 0}
                  onClick={() => setShowPassword((v) => !v)}
                  className="bg-transparent p-0 text-gray-500 hover:text-gray-800"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} />
                </button>
              </label>

              <button
                type="submit"
                disabled={loading}
                tabIndex={onBranchScreen ? -1 : 0}
                className="flex items-center justify-center gap-3 rounded-xl py-3.5 text-[16px] font-semibold text-white hover:opacity-90"
                style={{ background: GREEN }}
              >
                {loading ? 'Logging in...' : 'Login'}
                <Icon name="arrow" />
              </button>

              {message && <p className="m-0 text-[14px] text-brand-red">{message}</p>}

              {/* wrong branch (or wrong tab): the login was stopped */}
              {warning && (
                <div
                  key={warning.text}
                  role="alert"
                  className="flex animate-[login-warn_0.5s_ease] gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-[14px] text-amber-900"
                >
                  <Icon name="shield" className="mt-0.5 size-5 text-amber-600" />
                  <div className="grid gap-2">
                    <span>{warning.text}</span>
                    {warning.branch && (
                      <button
                        type="button"
                        onClick={() => switchBranch(warning.branch)}
                        className="justify-self-start rounded-lg px-3 py-1.5 text-[13px] font-semibold text-white"
                        style={{ background: GREEN }}
                      >
                        Go to {branchName(warning.branch)}
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="text-[14px]">
                <button
                  type="button"
                  tabIndex={onBranchScreen ? -1 : 0}
                  onClick={backToBranches}
                  className="bg-transparent p-0 underline hover:opacity-80"
                  style={{ color: GREEN }}
                >
                  ← Choose another branch
                </button>
              </div>
            </form>
        </div>
      </div>
    </div>
  )
}
