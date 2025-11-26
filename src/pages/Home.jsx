import PageLayout from "../components/PageLayout.jsx";

function Home() {
  return (
    <PageLayout
      icon="🏠"
      title="Home"
      subtitle="Quick overview of Pro West operations"
      actions={
        <>
          <button className="btn-pill primary">Today</button>
          <button className="btn-pill">This week</button>
        </>
      }
    >
      <div className="card">
        <h3 className="card-title">Welcome to ProWest Portal</h3>
        <p className="card-subtitle">
          Use the navigation on the left to access jobs, maps, schedule, forms and more.
        </p>
        <p style={{ fontSize: "0.85rem", color: "#555", marginTop: "0.35rem" }}>
          This portal is designed for both <strong>field</strong> and <strong>office</strong> use:
        </p>
        <ul style={{ fontSize: "0.85rem", marginTop: "0.3rem", paddingLeft: "1.1rem" }}>
          <li>Check today&apos;s jobs and locations.</li>
          <li>Open job sites directly in Google Maps.</li>
          <li>Access safety forms like Take 5 and vehicle prestarts.</li>
          <li>Log timesheets and view the schedule (coming soon).</li>
        </ul>
      </div>

      <div className="card">
        <h3 className="card-title">Quick links</h3>
        <div className="card-row">
          <span className="card-row-label">View today&apos;s jobs on the map</span>
          <a className="btn-pill" href="/maps">
            Open Maps
          </a>
        </div>
        <div className="card-row">
          <span className="card-row-label">Open job register</span>
          <a className="btn-pill" href="/jobs">
            Jobs
          </a>
        </div>
        <div className="card-row">
          <span className="card-row-label">View crew schedule</span>
          <a className="btn-pill" href="/schedule">
            Schedule
          </a>
        </div>
      </div>
    </PageLayout>
  );
}

export default Home;
