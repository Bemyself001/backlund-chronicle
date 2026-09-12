const paths = {
  story: ["M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Z", "M12 5v15"],
  character: ["M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z", "M4 21v-2a8 8 0 0 1 16 0v2"],
  inventory: ["M8 6V4h8v2", "M5 10a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v11H5Z", "M8 13h8v5H8Z"],
  journal: ["M5 3h15v18H5Z", "M3 7h4m-4 5h4m-4 5h4M10 8h6m-6 5h6"],
  map: ["m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Z", "M9 3v16m6-14v16"],
  menu: ["M4 6h16M4 12h16M4 18h16"],
};

export default function GameIcon({ name }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{(paths[name] || paths.menu).map((d, i) => <path key={i} d={d} />)}</svg>;
}
