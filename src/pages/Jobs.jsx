import PageLayout from "../components/PageLayout.jsx";

const mockJobs = [
  {
    id: "24051",
    name: "3 Lot Subdivision",
    client: "Smith Developments",
    suburb: "Hillarys",
    status: "Planned",
  },
  {
    id: "24052",
    name: "Strata Check",
    client: "ABC Strata",
    suburb: "Joondalup",
    status: "In progress",
  },
  {
    id: "24053",
    name: "Construction Setout",
    client: "BuildCorp",
    suburb: "Osborne Park",
    status: "Complete",
  },
];

function Jobs() {
  return (
    <PageLayout
      icon="📁"
      title="Jobs"
      subtitle="Overview of current and recent jobs from the Pro West register"
      actions={
        <>
          <button className="btn-pill primary">New job (future)</button>
          <button className="btn-pill">Export (future)</button>
        </>
      }
    >
      <div className="card">
        <h3 className="card-title">Job list</h3>
        <p className="card-subtitle">
          This is a mock layout. Later we can connect this to your real job registry or scheduler.
        </p>

        <div style={{ marginTop: "0.4rem" }}>
          {mockJobs.map((job) => (
            <div
              key={job.id}
              className="card-row"
              style={{ borderBottom: "1px solid #f0f2f7" }}
            >
              <div>
                <div className="card-row-label">
                  Job {job.id} · {job.name}
                </div>
                <div style={{ fontSize: "0.8rem", color: "#777" }}>
                  {job.client} · {job.suburb}
                </div>
              </div>
              <div style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                {job.status}
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageLayout>
  );
}

export default Jobs;
