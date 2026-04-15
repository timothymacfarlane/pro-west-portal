import PageLayout from "../components/PageLayout.jsx";

function Home() {
  return (
    <PageLayout
      icon="🏠"
      title="Home"
      subtitle="Welcome to Pro West Portal"
    >
<div className="card" data-home-card>
        <h3 className="card-title">Portal Updates</h3>
        <p style={{ fontSize: "0.85rem", color: "#555", marginTop: "0.35rem" }}>
          Portal fixes and updates will be listed here. The current version of the portal is shown in the footer of the of every page.
        </p>
        <ul style={{ fontSize: "0.85rem", marginTop: "0.3rem", paddingLeft: "1.1rem" }}>
          <strong>vX.X.X-beta</strong>
          <br />
          Current beta testing versions.
          </ul>
      </div>

      <div className="card" data-home-card>
        <h3 className="card-title">Welcome to Pro West Portal</h3>
        <p style={{ fontSize: "0.85rem", color: "#555", marginTop: "0.35rem" }}>
          The Pro West Portal has been created to streamline the management of jobs, field operations, and company registers. It brings together the tools we use across the business into one simplified, user friendly system that can be accessed from the office or out in the field.
        </p>
        <ul style={{ fontSize: "0.85rem", marginTop: "0.3rem", paddingLeft: "1.1rem" }}>
          <strong>What the Portal Does</strong>
          <li><strong>Contacts</strong> – Locate staff and client details in one unified register.</li>
          <li><strong>Documents</strong> – Access company documents, templates, checklists and external resource material in one location.</li>
          <li><strong>My Jobs</strong> – View and access the jobs assigned to you, including key details and site information. Receive notifications upon job assignment. (Not currently operational)</li>
          <li><strong>Jobs</strong> – View the job register, access job details, track project status, and quickly find site and client information.</li>
          <li><strong>Maps</strong> – View job locations, access mapping tools, and navigate directly to site.</li>
          <li><strong>Safety Forms</strong> – Complete Take 5 assessments and vehicle pre-start checks digitally in the field. With the ability to view historic information via the register.</li>
          <li><strong>Schedule</strong> – Plan and view upcoming work/leave for you and your team members.</li>
          <li><strong>Timesheets</strong> – Record time sheets daily with ease.</li>
          <li><strong>Weather</strong> - Rain, hail or shine, check the forecast right before you head to site.</li>
          <br />
          <strong>Built for Office and Field</strong>
          <br />
          The portal works on desktop, tablet, and mobile devices, allowing you to quickly check job information, navigate to sites, or complete forms while working in the office or the field.
          <br />
          <br />
          <strong>Continuous Improvement</strong>
<br />
The Pro West Portal will continue to evolve as we use it. New features and improvements will be added over time to make our workflows faster, clearer, and more efficient.

If you have suggestions or ideas for improvements, or identity any bugs/issues please let us know as they are always welcome.
          </ul>
      </div>

    </PageLayout>
  );
}

export default Home;
