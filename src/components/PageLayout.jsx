const APP_VERSION = "v1.3.6";

function HeaderActions({ extraActions }) {
  return (
    <div className="page-actions" role="group" aria-label="Page actions">
      {extraActions}
    </div>
  );
}

function PageLayout({ icon, title, subtitle, actions, children, className = "", ...pageProps }) {
  return (
    <div className={`page${className ? ` ${className}` : ""}`} data-layout="page" {...pageProps}>
      <header className="page-header" role="banner">
        <div className="page-title-group">
          {icon && <span className="page-icon">{icon}</span>}
          <div>
            <h2 className="page-title">{title}</h2>
            {subtitle && <p className="page-subtitle">{subtitle}</p>}
          </div>
        </div>

        <HeaderActions extraActions={actions} />
      </header>

            <div className="page-body">{children}</div>

      <footer className="page-footer" role="contentinfo" aria-label="Footer">
        <span className="page-footer-version">{APP_VERSION}</span>
      </footer>
    </div>
  );
}


export default PageLayout;
