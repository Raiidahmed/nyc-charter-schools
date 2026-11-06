import { useId, useState, type ReactNode } from 'react';
import { sizeOf, SIZES } from '../lib/filters.ts';
import { federalProfileUrl, formatMiles, formatMinutes, formatNumber, googleDirections, stateProfileUrl } from '../lib/format.ts';
import { gradeRange } from '../lib/grades.ts';
import { authorizerInfo, MODES, ratingBasis, ratingInfo, TRANSFER_RATING_NOTE, typeLabel } from '../lib/labels.ts';
import type { Trip } from '../lib/travel.ts';
import type { School, TravelMode } from '../lib/types.ts';
import { useExplorer } from '../state/Explorer.tsx';
import { LineBullet } from '../ui/controls.tsx';
import { CloseIcon, ExternalIcon, InfoIcon } from '../ui/icons.tsx';

function Info({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <button type="button" className="info-button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} aria-label={label} title={label}>
        <InfoIcon />
      </button>
      <p id={id} className="info-text" hidden={!open}>
        {children}
      </p>
    </>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Out({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="out-link">
      {children}
      <ExternalIcon />
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}

function CommuteRow({ mode, trip, school, home, cutoff }: { mode: TravelMode; trip: Trip | undefined; school: School; home: { lat: number; lon: number }; cutoff: number }) {
  const info = MODES.find((m) => m.id === mode)!;
  const minutes = mode === 'drive' ? (trip?.driveRush ?? null) : (trip?.[mode] ?? null);
  return (
    <li className="commute">
      <span className="commute-mode">{info.label}</span>
      <span className="commute-time">
        {minutes === null ? (
          <>More than {formatMinutes(cutoff)}</>
        ) : mode === 'drive' ? (
          <>
            ≈ {formatMinutes(minutes)} at rush hour
            <span className="commute-sub">≈ {formatMinutes(trip!.drive!)} with no traffic</span>
          </>
        ) : (
          <>≈ {formatMinutes(minutes)}</>
        )}
      </span>
      <Out href={googleDirections(home, school, mode)}>Route</Out>
    </li>
  );
}

export function SchoolDetails({ school }: { school: School }) {
  const { home, ctx, trips, travelIndex, travelStatus, closeDetails, backToList, data, select } = useExplorer();
  const { summary } = data;
  const miles = ctx.distances?.get(school.id);
  const size = sizeOf(school.enrollment);
  const auth = authorizerInfo(school.authorizer);
  const rating = school.rating ? ratingInfo(school.rating) : null;
  const yourDistrict = home?.district != null && home.district === school.district;
  const sameAddress = data.schools.filter((s) => s.id !== school.id && s.address === school.address && s.zip === school.zip);
  const trip = trips?.get(school.id);

  return (
    <article className="details" aria-labelledby="details-name">
      <div className="details-bar">
        <button type="button" className="link-button back" onClick={backToList}>
          ‹ Back to list
        </button>
        <button type="button" className="icon-button" onClick={closeDetails} aria-label="Close school details" title="Close (Esc)">
          <CloseIcon />
        </button>
      </div>
      <div className="details-body">
        <h2 id="details-name" className="details-name">
          {school.name}
        </h2>
        <div className="badges">
          {school.network && <span className="badge-soft">{school.network}</span>}
          {school.type !== 'general' && <span className="badge-soft">{typeLabel(school.type)}</span>}
          {yourDistrict && <span className="badge-soft accent">In your district</span>}
        </div>

        <dl className="facts">
          {miles !== undefined && <Fact label="From home">{formatMiles(miles)} in a straight line</Fact>}
          <Fact label="Grades">{gradeRange(school.gradeLow, school.gradeHigh)}</Fact>
          <Fact label="Enrollment">
            {school.enrollment === null ? (
              'Not reported'
            ) : (
              <>
                {formatNumber(school.enrollment)} students · {SIZES.find((s) => s.id === size)?.label}
                <span className="fact-sub">{summary.enrollmentYear} count</span>
              </>
            )}
          </Fact>
          <Fact label="Student–teacher ratio">{school.ratio === null ? 'Not reported' : `${school.ratio}:1`}</Fact>
          <Fact label="Address">
            {school.address}
            <span className="fact-sub">
              {school.city}, NY {school.zip}
            </span>
          </Fact>
          <Fact label="Borough and district">
            {school.borough} · District {school.district}
            {yourDistrict && <span className="fact-sub">Your district, so your child would get the district preference in its lottery.</span>}
          </Fact>
          <Fact label="Opened">{school.opened}</Fact>
          <Fact label="Authorizer">
            <span className="with-info">
              {auth.label}
              <Info label="What an authorizer does">{auth.about}</Info>
            </span>
          </Fact>
          <Fact label="State rating">
            {rating ? (
              <>
                <span className="with-info">
                  {rating.label}
                  <Info label="What the state rating means">
                    {rating.state}: {rating.about} {ratingBasis(summary.ratingYear)} It is a support level, not a grade.
                  </Info>
                </span>
                {school.type === 'transfer' && school.rating !== 'local' && <span className="fact-sub">{TRANSFER_RATING_NOTE}</span>}
              </>
            ) : (
              'None yet'
            )}
          </Fact>
          {school.phone && (
            <Fact label="Phone">
              <a href={`tel:${school.phone.replace(/[^\d+]/g, '')}`}>{school.phone}</a>
            </Fact>
          )}
        </dl>

        {home && travelStatus !== 'missing' && (
          <section className="details-section">
            <h3>Commute estimates</h3>
            {trips && travelIndex ? (
              <ul className="commutes">
                {MODES.map((m) => (
                  <CommuteRow key={m.id} mode={m.id} trip={trip} school={school} home={home} cutoff={travelIndex.cutoffs[m.id]} />
                ))}
              </ul>
            ) : (
              <p className="muted">{travelStatus === 'outside' ? 'No estimates for this spot.' : 'Loading estimates…'}</p>
            )}
            <p className="muted small">Estimates computed ahead of time, leaving 7–8 a.m. on a weekday. Routes open in Google Maps.</p>
          </section>
        )}

        {school.stations.length > 0 && (
          <section className="details-section">
            <h3>Nearby subway</h3>
            <ul className="stations">
              {school.stations.map((st) => (
                <li key={st.id} className="station">
                  <span className="station-lines">
                    {st.lines.map((l) => (
                      <LineBullet key={l} line={l} size="sm" />
                    ))}
                  </span>
                  <span className="station-name">
                    {st.name}
                    <span className="station-access">
                      {st.access === 'full' ? 'Accessible' : st.access === 'partial' ? `Partly accessible${st.accessNote ? `: ${st.accessNote}` : ''}` : 'Not accessible'}
                    </span>
                  </span>
                  <span className="station-walk">≈ {st.walk} min walk</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {sameAddress.length > 0 && (
          <section className="details-section">
            <h3>Also at this address</h3>
            <ul className="same-address">
              {sameAddress.map((s) => (
                <li key={s.id}>
                  <button type="button" className="link-button" onClick={() => select(s.id)}>
                    {s.name}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="details-section links">
          <Out href={googleDirections(home, school, home ? 'transit' : null)}>Directions</Out>
          <Out href={stateProfileUrl(school)}>State school profile</Out>
          <Out href={federalProfileUrl(school)}>Federal profile</Out>
        </section>
      </div>
    </article>
  );
}
