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
          <br />
          To access Pro West Portal: <strong>https://pro-west-portal.netlify.app/</strong>
        </p>
        <ul style={{ fontSize: "0.85rem", marginTop: "0.3rem", paddingLeft: "1.1rem" }}>
          <strong>Current Version - v1.1.8</strong>
          <br />
          v1.1.8 - 28/06/2026 - Additional layers added to Maps page.
          <br />
          v1.1.7 - 28/06/2026 - View in Maps added to Job Planning Page - Admin only.
          <br />
          v1.1.6 - 27/06/2026 - Job Number search box added to Job Planning Page - Admin only.
          <br />
          v1.1.5 - 03/06/2026 - Maps Cadastre layer additional data.
          <br />
          v1.1.4 - Equipment Register amendments.
          <br />
          v1.1.3 - Job address warning messages for manual address input (not confirmed Google street address) and no street address.
          <br />
          v1.1.2 - Numerous map improvements.
          <br />
          v1.1.1 - Automatically creates new job folders on server.
          <br />
          v1.1.0 - Equipment Register page added.
           <br />
          v1.0.1 - Maps export layers to different projections corrected, now works with MGA and PCG2020.
           <br />
          v1.0.0 - Initial release after beta testing.
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
          <li><strong>Shopping List</strong> – For anyone to add to, running low on anything, add it to the list. This helps maintain inventory.</li>
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
