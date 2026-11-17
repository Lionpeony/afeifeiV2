/* ---------- v4 追加图标 ---------- */
const IconHeart = (p) => <Ic {...p}><path d="M12 20.4s-7.2-4.4-7.2-9.1a4.2 4.2 0 0 1 7.2-3 4.2 4.2 0 0 1 7.2 3c0 4.7-7.2 9.1-7.2 9.1z"/></Ic>;
const IconHeartFill = (p) => <Ic {...p}><path d="M12 20.4s-7.2-4.4-7.2-9.1a4.2 4.2 0 0 1 7.2-3 4.2 4.2 0 0 1 7.2 3c0 4.7-7.2 9.1-7.2 9.1z" fill="currentColor" stroke="none"/></Ic>;
const IconFolder = (p) => <Ic {...p}><path d="M3.6 7.4c0-1.1.9-2 2-2h3.5l2 2.4h7.3c1.1 0 2 .9 2 2v7.8c0 1.1-.9 2-2 2H5.6c-1.1 0-2-.9-2-2z"/></Ic>;
const IconDownload = (p) => <Ic {...p}><path d="M12 4v10.4"/><path d="M8 11.2 12 15.2l4-4"/><path d="M4.6 17.4v1.2c0 1 .8 1.8 1.8 1.8h11.2c1 0 1.8-.8 1.8-1.8v-1.2"/></Ic>;
const IconList = (p) => <Ic {...p}><path d="M4 6.4h2.2M4 12h2.2M4 17.6h2.2"/><path d="M9.4 6.4H20M9.4 12H20M9.4 17.6H20"/></Ic>;
const IconRefresh = (p) => <Ic {...p}><path d="M20 11.4A8 8 0 0 0 6.3 6.6L4 8.8"/><path d="M4 4.6v4.2h4.2"/><path d="M4 12.6a8 8 0 0 0 13.7 4.8L20 15.2"/><path d="M20 19.4v-4.2h-4.2"/></Ic>;
const IconImport = (p) => <Ic {...p}><path d="M12 15.4V4.6"/><path d="M8 8.6 12 4.6l4 4"/><path d="M4.6 14.4v4.2c0 1 .8 1.8 1.8 1.8h11.2c1 0 1.8-.8 1.8-1.8v-4.2"/></Ic>;
const IconMore = (p) => <Ic {...p}><circle cx="5.4" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="18.6" cy="12" r="1.5" fill="currentColor" stroke="none"/></Ic>;
const IconMin = (p) => <Ic {...p}><path d="M5 12h14"/></Ic>;
const IconMax = (p) => <Ic {...p}><rect x="5.4" y="5.4" width="13.2" height="13.2" rx="1.6"/></Ic>;
const IconDisc = (p) => <Ic {...p}><circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="2.2"/></Ic>;
const IconUser = (p) => <Ic {...p}><circle cx="12" cy="8.6" r="3.8"/><path d="M4.8 20c.6-3.6 3.6-5.8 7.2-5.8s6.6 2.2 7.2 5.8"/></Ic>;
const IconCloud = (p) => <Ic {...p}><path d="M7.4 18.4h9.3a3.9 3.9 0 0 0 .4-7.8 5.5 5.5 0 0 0-10.5-1 4.4 4.4 0 0 0 .8 8.8z"/></Ic>;
const IconQR = (p) => <Ic {...p}><rect x="4" y="4" width="6.4" height="6.4" rx="1.4"/><rect x="13.6" y="4" width="6.4" height="6.4" rx="1.4"/><rect x="4" y="13.6" width="6.4" height="6.4" rx="1.4"/><path d="M13.6 13.6h2.8v2.8h-2.8zM17.2 17.2h2.8v2.8h-2.8z"/></Ic>;
const IconLogout = (p) => <Ic {...p}><path d="M14.4 4.6H6.4c-1 0-1.8.8-1.8 1.8v11.2c0 1 .8 1.8 1.8 1.8h8"/><path d="M17.4 8.6 20.8 12l-3.4 3.4"/><path d="M10.6 12h10"/></Ic>;

Object.assign(window, {
  IconHeart, IconHeartFill, IconFolder, IconDownload, IconList, IconRefresh, IconImport,
  IconMore, IconMin, IconMax, IconDisc, IconUser, IconCloud, IconQR, IconLogout
});
