import React from 'react';

/* Brand visuals for SuperClick. Animations use the sc-* keyframes defined in src/index.css. */

export const ZawGyiHero: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 400 316" className={className} aria-hidden="true"><defs>
<radialGradient id="zg-rg"><stop offset="0" stopColor="#FF8C28" stopOpacity=".5"/><stop offset="1" stopColor="#FF8C28" stopOpacity="0"/></radialGradient>
<radialGradient id="zg-rm" cx=".4" cy=".35"><stop offset="0" stopColor="#FFF6DC"/><stop offset=".6" stopColor="#FFC271"/><stop offset="1" stopColor="#F06A22"/></radialGradient>
<linearGradient id="zg-rd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FF4A3A"/><stop offset="1" stopColor="#7E0C1C"/></linearGradient>
<linearGradient id="zg-gl" x1="0" x2="1"><stop offset="0" stopColor="#FFE7A8"/><stop offset=".5" stopColor="#F8B230"/><stop offset="1" stopColor="#A8400C"/></linearGradient>
<linearGradient id="zg-sk"><stop offset="0" stopColor="#E7A872"/><stop offset="1" stopColor="#A5603A"/></linearGradient>
<linearGradient id="zg-sa" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#D23BE0"/><stop offset="1" stopColor="#6B1B9A"/></linearGradient>
<filter id="zg-fg" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
<circle cx="262" cy="150" r="175" fill="url(#zg-rg)"/><circle cx="262" cy="140" r="104" fill="url(#zg-rm)" opacity=".93"/><circle cx="232" cy="110" r="14" fill="#E58A3A" opacity=".25"/><circle cx="300" cy="170" r="20" fill="#E58A3A" opacity=".2"/>
<path d="M330 316C326 250 350 205 400 188V316Z" fill="#0B0A10"/><path d="M0 300C90 280 160 296 240 292S360 282 400 292V316H0Z" fill="#0B0709"/><path d="M360 200C346 176 356 150 380 140C376 170 388 186 400 190Z" fill="#0F2A26"/><path d="M20 316C30 280 52 262 80 258C70 280 80 300 96 316Z" fill="#0F2A26"/>
<ellipse cx="228" cy="294" rx="78" ry="8" fill="#000" opacity=".55"/>
<path d="M246 108C292 94 342 118 360 172C332 152 302 160 288 194C284 160 262 142 244 152Z" fill="url(#zg-rd)"/><path d="M246 108C292 94 342 118 360 172" fill="none" stroke="#FF9A80" strokeWidth="1.6" opacity=".7"/>
<path d="M246 198C262 230 268 262 252 284" fill="none" stroke="#5E0B18" strokeWidth="24" strokeLinecap="round"/><path d="M238 286q14-9 32-2l-4 9h-28z" fill="url(#zg-gl)"/>
<path d="M322 14 268 296" stroke="url(#zg-gl)" strokeWidth="7" strokeLinecap="round"/><path d="M319 16 265 296" stroke="#FFF0C0" strokeWidth="1.4" opacity=".7"/><ellipse cx="316" cy="46" rx="6" ry="3" fill="url(#zg-gl)" transform="rotate(-10 316 46)"/><ellipse cx="287" cy="190" rx="6" ry="3" fill="url(#zg-gl)" transform="rotate(-10 287 190)"/>
<path d="M238 198 190 230 200 272" fill="none" stroke="url(#zg-rd)" strokeWidth="24" strokeLinejoin="round" strokeLinecap="round"/><path d="M200 262l2 10" stroke="#F8B230" strokeWidth="6"/><path d="M184 278q20-12 42-3l-2 10h-40z" fill="url(#zg-gl)"/><path d="M184 278q-8-2-10-10 8 2 14 6z" fill="url(#zg-gl)"/>
<path d="M214 112C226 104 250 104 262 112L268 196C250 206 226 206 212 198Z" fill="url(#zg-rd)"/><path d="M226 108 240 142 254 108" fill="none" stroke="url(#zg-gl)" strokeWidth="4" strokeLinejoin="round"/><g fill="#FFE7A8"><circle cx="240" cy="154" r="2.4"/><circle cx="240" cy="168" r="2.4"/><circle cx="240" cy="182" r="2.4"/></g>
<path d="M212 192C232 206 256 206 270 192L274 204C254 220 226 220 210 206Z" fill="url(#zg-sa)"/><path d="M212 202C190 216 186 240 168 254 194 254 208 238 220 216Z" fill="url(#zg-sa)"/>
<path d="M258 118 286 148 300 136" fill="none" stroke="url(#zg-rd)" strokeWidth="17" strokeLinejoin="round" strokeLinecap="round"/><circle cx="299" cy="135" r="9" fill="url(#zg-sk)"/><path d="M218 120 198 156 226 178" fill="none" stroke="url(#zg-rd)" strokeWidth="16" strokeLinejoin="round" strokeLinecap="round"/><circle cx="230" cy="180" r="8" fill="url(#zg-sk)"/>
<path d="M232 94h16v18h-16z" fill="url(#zg-sk)"/><ellipse cx="240" cy="82" rx="17" ry="19" fill="url(#zg-sk)"/><path d="M227 92Q240 108 253 92Q240 100 227 92Z" fill="#2A1710"/><ellipse cx="233" cy="82" rx="3" ry="1.7" fill="#9FF3FF" filter="url(#zg-fg)"/><ellipse cx="247" cy="82" rx="3" ry="1.7" fill="#9FF3FF" filter="url(#zg-fg)"/>
<path d="M256 72C280 62 296 76 312 62 300 86 280 86 258 84Z" fill="url(#zg-rd)"/><path d="M222 76C222 54 258 54 258 76 250 70 230 70 222 76Z" fill="url(#zg-rd)"/><path d="M222 76C232 69 248 69 258 76" fill="none" stroke="url(#zg-gl)" strokeWidth="3.4"/><circle cx="240" cy="58" r="7" fill="url(#zg-rd)"/>
<g fill="none" stroke="#D6F8FF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" filter="url(#zg-fg)"><path d="M324 20 312 52 322 56 306 96 316 100 300 142 310 146 292 190 300 194 282 240" style={{ animation: 'sc-flick 1.3s infinite' }}/><path d="M300 132 330 120 322 108 350 94" style={{ animation: 'sc-flick 1.3s .4s infinite' }}/><path d="M296 172 330 178 324 190 352 196" style={{ animation: 'sc-flick 1.3s .8s infinite' }}/></g>
<path d="M0-6 1.5-1.5 6 0 1.5 1.5 0 6-1.5 1.5-6 0-1.5-1.5Z" transform="translate(150 70) scale(1.3)" fill="#FFE2A0" style={{ animation: 'sc-flick 2.4s infinite' }}/><path d="M0-6 1.5-1.5 6 0 1.5 1.5 0 6-1.5 1.5-6 0-1.5-1.5Z" transform="translate(370 60) scale(1)" fill="#FFE2A0" style={{ animation: 'sc-flick 2.4s infinite' }}/><path d="M0-6 1.5-1.5 6 0 1.5 1.5 0 6-1.5 1.5-6 0-1.5-1.5Z" transform="translate(190 200) scale(0.9)" fill="#FFE2A0" style={{ animation: 'sc-flick 2.4s infinite' }}/><path d="M0-6 1.5-1.5 6 0 1.5 1.5 0 6-1.5 1.5-6 0-1.5-1.5Z" transform="translate(120 250) scale(1.1)" fill="#FFE2A0" style={{ animation: 'sc-flick 2.4s infinite' }}/></svg>
);

export const BoltConnector: React.FC<{ active?: boolean; className?: string }> = ({ active = true, className = '' }) => {
  const d = 'M0 13H24L34 3L46 23L58 5L70 21L82 7L94 21L106 9L118 13H150';
  return (
    <svg viewBox="0 0 150 26" preserveAspectRatio="none" aria-hidden="true"
      className={`flex-1 h-6 min-w-[24px] ${className}`}
      style={{ filter: active ? 'drop-shadow(0 0 5px #FF6A2B)' : undefined }}>
      <path d={d} fill="none" stroke={active ? '#E03A24' : 'currentColor'} strokeOpacity={active ? 1 : 0.25}
        strokeWidth="3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {active && (
        <path d={d} fill="none" stroke="#FFE2A0" strokeWidth="1.6" strokeDasharray="14 10" strokeLinejoin="round"
          vectorEffect="non-scaling-stroke" style={{ animation: 'sc-flow .8s linear infinite' }} />
      )}
    </svg>
  );
};

export const MyanmarStrip: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg width="100%" height="16" aria-hidden="true" className={className}>
    <defs>
      <pattern id="sc-mm" width="24" height="16" patternUnits="userSpaceOnUse">
        <path d="M12 2 20 8 12 14 4 8Z" fill="none" stroke="#F6A21E" strokeOpacity=".7" />
        <circle cx="12" cy="8" r="1.6" fill="#F6A21E" />
      </pattern>
    </defs>
    <rect width="100%" height="16" fill="url(#sc-mm)" />
  </svg>
);

export const ProcessingOrb: React.FC<{ className?: string }> = ({ className }) => {
  const ring = (rot: number, dur: number, reverse: boolean) => (
    <svg width="210" height="210" viewBox="0 0 210 210" aria-hidden="true"
      style={{ position: 'absolute', inset: 0, animation: `sc-spin ${dur}s linear infinite ${reverse ? 'reverse' : ''}` }}>
      <ellipse cx="105" cy="105" rx="98" ry="32" fill="none" stroke="#FF8A3C" strokeWidth="3" transform={`rotate(${rot} 105 105)`} />
      <circle cx="203" cy="105" r="6" fill="#FFE2A0" transform={`rotate(${rot} 105 105)`} style={{ filter: 'drop-shadow(0 0 6px #FF9A3C)' }} />
    </svg>
  );
  const arc = (d: string, delay: number) => (
    <path d={d} fill="none" stroke="#FFE2A0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
      style={{ animation: `sc-flick 1.4s ${delay}s infinite`, filter: 'drop-shadow(0 0 4px #FF9A3C)' }} />
  );
  return (
    <div className={className} style={{ width: 210, margin: '0 auto' }}>
      <div style={{ position: 'relative', width: 210, height: 210 }}>
        <div style={{ position: 'absolute', inset: -24, borderRadius: '50%', background: 'radial-gradient(circle,rgba(240,90,14,.35),transparent 65%)' }} />
        {ring(-24, 5, false)}
        <div style={{ position: 'absolute', left: 40, top: 40, width: 130, height: 130, borderRadius: '50%',
          background: 'radial-gradient(circle at 32% 26%,#FFC37A 0%,#F05A0E 36%,#B01E2E 70%,#3F0A12 100%)',
          boxShadow: 'inset -12px -16px 26px rgba(0,0,0,.5),inset 8px 10px 18px rgba(255,255,255,.28),0 22px 50px rgba(224,58,36,.55)' }} />
        <div style={{ position: 'absolute', left: 62, top: 54, width: 36, height: 18, borderRadius: '50%', background: 'rgba(255,255,255,.55)', filter: 'blur(4px)', transform: 'rotate(-30deg)' }} />
        <div style={{ position: 'absolute', left: 77, top: 77, animation: 'sc-flick 1.6s infinite', filter: 'drop-shadow(0 0 8px #FFD27A)' }}>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="#fff" stroke="#fff" strokeWidth="1" strokeLinejoin="round" aria-hidden="true">
            <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
          </svg>
        </div>
        {ring(26, 7, true)}
        <svg width="210" height="210" viewBox="0 0 210 210" aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
          {arc('M150 50L160 38L153 36L168 18', 0)}
          {arc('M54 70L42 82L50 84L34 100', 0.5)}
          {arc('M122 168L130 182L121 182L132 198', 0.9)}
          {arc('M164 120L180 126L172 132L190 142', 0.3)}
        </svg>
      </div>
      <div style={{ width: 130, height: 14, margin: '8px auto 0', borderRadius: '50%', background: 'rgba(0,0,0,.5)', filter: 'blur(7px)' }} />
    </div>
  );
};
