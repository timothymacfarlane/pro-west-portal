import PageLayout from "../components/PageLayout.jsx";

function Weather() {
  return (
    <PageLayout data-weather
      icon="🌦️"
      title="Weather"
      subtitle="Radar and marine conditions around Perth for Pro West jobs"
    >
      {/* Intro / info card */}
      <div className="card">
        <h3 className="card-title">Weather overview</h3>
        <p className="card-subtitle">
          Quick access to Perth rain radar and marine / wind conditions
          commonly used for Pro&nbsp;West field work.
        </p>

        <div
          style={{
            marginTop: "0.6rem",
            fontSize: "0.8rem",
            color: "#666",
          }}
        >
          <ul style={{ marginLeft: "1rem" }}>
            <li>
              <strong>Radar</strong> &mdash; BOM Perth rain radar loop.
            </li>
            <li>
              <strong>Marine / wind</strong> &mdash; Seabreeze Perth wind
              forecast.
            </li>
          </ul>
        </div>
      </div>

      {/* Radar section */}
      <div className="card">
        <h3 className="card-title">Perth rain radar (BOM)</h3>
        <p className="card-subtitle">
          Official BOM Perth radar loop. Useful for planning field work around
          showers and fronts.
        </p>

        <div
          style={{
            marginTop: "0.6rem",
            borderRadius: "0.75rem",
            overflow: "hidden",
            border: "1px solid rgba(0,0,0,0.06)",
          }}
        >
          <iframe referrerPolicy="no-referrer-when-downgrade"
            title="BOM Perth rain radar"
            src="https://www.bom.gov.au/products/IDR70B.loop.shtml"
            style={{
              width: "100%",
              minHeight: "650px",   // larger view so most of the radar UI fits
              border: "0",
            }}
            loading="lazy"
          />
        </div>
      </div>

      {/* Marine / wind section */}
      <div className="card">
        <h3 className="card-title">Marine / wind (Seabreeze Perth)</h3>
        <p className="card-subtitle">
          Seabreeze Perth wind forecast and graphs, handy for planning coastal
          and offshore work days.
        </p>

        <div
          style={{
            marginTop: "0.6rem",
            borderRadius: "0.75rem",
            overflow: "hidden",
            border: "1px solid rgba(0,0,0,0.06)",
          }}
        >
          <iframe referrerPolicy="no-referrer-when-downgrade"
            title="Seabreeze Perth wind forecast"
            src="https://www.seabreeze.com.au/weather/wind-forecast/perth#"
            style={{
              width: "100%",
              minHeight: "800px",   // taller so graphs + controls are visible together
              border: "0",
            }}
            loading="lazy"
          />
        </div>
      </div>
    </PageLayout>
  );
}

export default Weather;
