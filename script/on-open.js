// Shared onOpen handler to register RepostLens menus when the spreadsheet loads.
function onOpen() {
  const globalAny = /** @type {any} */ (globalThis);

  const autoMenu = globalAny?.RL_AUTO_onOpenMenu;
  if (typeof autoMenu === 'function') autoMenu();

  const batchMenu = globalAny?.RL_BATCH_onOpenMenu;
  if (typeof batchMenu === 'function') batchMenu();

  const convMenu = globalAny?.RL_CONV_onOpenMenu;
  if (typeof convMenu === 'function') convMenu();
}
