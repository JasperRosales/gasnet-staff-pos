import { supabase } from '../lib/supabaseClient'
import { branchName } from '../lib/branches'
import { confirmDialog } from '../lib/dialogs'

// Same top bar picture as the admin portal: blue-green band, then white and red stripes
const NAVBAR_IMAGE = '/navbarcolor.jpg'
const TEAL_PART = '66%'

const tabClass = (active) =>
  `whitespace-nowrap rounded-lg px-4 py-2 text-[15px] font-medium hover:opacity-100 max-[700px]:px-2.5 max-[700px]:text-[14px] ${
    active ? 'bg-white text-brand-pine' : 'bg-transparent text-white/85 hover:bg-white/15 hover:text-white'
  }`

// tabs = [{ key, label }]
export default function PosLayout({ branch, fullName, tabs, active, onSelect, children }) {
  const logout = async () => {
    if (await confirmDialog('Are you sure you want to log out?')) supabase.auth.signOut()
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-(--bg)">
      <header
        className="no-print box-border h-[88px] shrink-0 bg-no-repeat max-[700px]:h-[72px]"
        style={{ backgroundImage: `url("${NAVBAR_IMAGE}")`, backgroundSize: '100% 100%' }}
      >
        <div className="box-border flex items-center gap-3 px-5 max-[700px]:px-3" style={{ height: TEAL_PART }}>
          <img className="block h-[80%] w-auto max-[700px]:hidden" src="/cjg-logo-bar.png" alt="CJG" />
          <nav className="flex min-w-0 gap-1 overflow-x-auto">
            {tabs.map((t) => (
              <button key={t.key} className={tabClass(active === t.key)} onClick={() => onSelect(t.key)}>
                {t.label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-white">
            <div className="text-right leading-tight max-[700px]:hidden">
              <div className="text-[15px] font-semibold">{branchName(branch)} branch</div>
              <div className="text-[14px] opacity-80">{fullName}</div>
            </div>
            <button className="whitespace-nowrap bg-white/15 hover:bg-white/25 max-[700px]:px-2.5" onClick={logout}>
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-5 text-left max-[700px]:p-3">{children}</main>
    </div>
  )
}
