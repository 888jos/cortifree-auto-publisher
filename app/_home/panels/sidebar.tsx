import Link from "next/link";
import { menus, type ProductVersion, type View } from "../data";

// Workspace switcher, version toggle, main navigation and account footer.
export function Sidebar({ active, setActive, productVersion, changeProductVersion }: { active: View; setActive: (view: View) => void; productVersion: ProductVersion; changeProductVersion: (version: ProductVersion) => void }) {
  return (
    <aside>
      <div className="workspaceSwitcher">
        <div className="brand">
          <span className="mark">CF</span>
          <span>CortiFree</span>
        </div>
        <label htmlFor="workspace-select">Application</label>
        <select aria-label="Application CortiFree" disabled id="workspace-select" value="cortifree">
          <option value="cortifree">CortiFree · Carrousels</option>
        </select>
        <div className="versionSwitch" aria-label="Version de CortiFree" role="group">
          <button className={productVersion === "current" ? "active" : ""} onClick={() => changeProductVersion("current")} type="button">Actuelle</button>
          <button className={productVersion === "next" ? "active" : ""} onClick={() => changeProductVersion("next")} type="button">Nouvelle</button>
        </div>
      </div>

      {productVersion === "current" && <nav aria-label="Main navigation">
        {menus.map((menu) => (
          <button
            key={menu}
            className={active === menu ? "active" : ""}
            onClick={() => setActive(menu)}
            type="button"
          >
            {menu}
          </button>
        ))}
        <Link className="templateLabNav" href="/review">Review Queue ↗</Link>
        <Link className="templateLabNav" href="/planning">Planning ↗</Link>
        <Link className="templateLabNav" href="/templates">Template Lab ↗</Link>
      </nav>}

      <div className="account">
        <div className="avatar">CF</div>
        <div>
          <b>CortiFree</b>
          <small>Workspace</small>
        </div>
        <form action="/api/auth/logout" method="post"><button className="logoutButton" type="submit">Logout</button></form>
      </div>
    </aside>
  );
}

