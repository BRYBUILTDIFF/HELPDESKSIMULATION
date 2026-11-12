export default function TerminalReview({stepIndex, events = []}) {
 const entries = events.filter(event => event.step === stepIndex);
 return <div className="terminal-review" role="region" aria-label="Completed step terminal history" tabIndex={0}>
  <p>Recorded output: Step {stepIndex + 1}</p>
  {entries.length ? entries.map((event,index) => <div key={index}>
   <pre>{event.kind === 'checkpoint' ? '[Simulated checkpoint]' : '> ' + (event.command || '')}</pre>
   <pre>{event.output}</pre>
   {event.accepted ? <span>Step verified</span> : null}
  </div>) : <p>No recorded terminal output remains for this step. Review its instruction and expected output above.</p>}
 </div>;
}
