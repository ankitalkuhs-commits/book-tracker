// T-22 (A creates; B and C must keep it green) — source-shape assertions for
// every Package A/B/C item in architecture.md. Cases for B and C's own files
// are included here per T-22 ("B owns no test file... assertions live in A's
// sourceRules.test.mjs"). Until all three packages are merged, the B/C rows
// are EXPECTED to fail (or error on a file that doesn't exist yet) — see
// build-notes-A.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMobileFile, readMobile, walk, findAll, listMobileFiles } from './_ast.mjs';

function findApiCalls(ast, objName, methodName) {
  return findAll(ast, (n) => n.type === 'CallExpression' && n.callee.type === 'MemberExpression'
    && n.callee.object.name === objName && n.callee.property.name === methodName);
}

// ── console_calls_all_inside_dev_guard (R18 / S62) ──────────────────────────
function collectConsoleCalls(ast) {
  const results = [];
  const SKIP = new Set(['loc', 'start', 'end', 'range', 'leadingComments', 'trailingComments', 'innerComments', 'extra']);
  function visit(node, ancestors) {
    if (!node || typeof node !== 'object' || typeof node.type !== 'string') return;
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression'
      && node.callee.object.type === 'Identifier' && node.callee.object.name === 'console') {
      results.push({ node, ancestors: ancestors.slice() });
    }
    for (const key of Object.keys(node)) {
      if (SKIP.has(key)) continue;
      const value = node[key];
      if (Array.isArray(value)) {
        for (const item of value) visit(item, [...ancestors, node]);
      } else if (value && typeof value === 'object' && typeof value.type === 'string') {
        visit(value, [...ancestors, node]);
      }
    }
  }
  visit(ast.program, []);
  return results;
}

function isDevGuarded({ ancestors }) {
  return ancestors.some((anc) => {
    if (anc.type === 'IfStatement' && anc.test.type === 'Identifier' && anc.test.name === '__DEV__') return true;
    if (anc.type === 'LogicalExpression' && anc.operator === '&&' && anc.left.type === 'Identifier' && anc.left.name === '__DEV__') return true;
    return false;
  });
}

test('console_calls_all_inside_dev_guard', () => {
  const files = ['App.js', ...listMobileFiles('src')];
  for (const rel of files) {
    let ast;
    try { ast = parseMobileFile(rel); } catch { continue; }
    for (const entry of collectConsoleCalls(ast)) {
      assert.ok(isDevGuarded(entry), `${rel}: ungated console call`);
    }
  }
});

// ── note_visibility_key_literal_once_in_api_js (R11 / S39) ─────────────────
test('note_visibility_key_literal_once_in_api_js', () => {
  const files = ['App.js', ...listMobileFiles('src')];
  let count = 0;
  let apiJsOk = false;
  for (const rel of files) {
    const src = readMobile(rel);
    const matches = src.match(/bt_note_visibility/g) || [];
    count += matches.length;
    if (rel === 'src/services/api.js') {
      apiJsOk = matches.length === 1 && /export const NOTE_VISIBILITY_KEY = 'bt_note_visibility';/.test(src);
    }
    if (rel === 'src/utils/noteVisibility.js') {
      assert.equal(matches.length, 0, 'noteVisibility.js must not contain the key literal');
    }
  }
  assert.equal(count, 1, `expected exactly one 'bt_note_visibility' literal, found ${count}`);
  assert.ok(apiJsOk, "api.js must export NOTE_VISIBILITY_KEY = 'bt_note_visibility'");
});

// ── notification_service_has_no_fetch_or_base_url (R2 / S10) ───────────────
test('notification_service_has_no_fetch_or_base_url', () => {
  const src = readMobile('src/services/NotificationService.js');
  assert.ok(!/\bfetch\s*\(/.test(src));
  assert.ok(!/API_BASE_URL/.test(src));
  assert.ok(!/['"]https?:\/\//.test(src));
});

// ── deregister_resets_guard_before_network_call (R2 / S13) ─────────────────
test('deregister_resets_guard_before_network_call', () => {
  const src = readMobile('src/services/NotificationService.js');
  assert.match(src, /export function resetPushRegistration\(\)\s*\{[^}]*lastRegisteredExpoToken = null;[^}]*registrationEpoch \+= 1;/);
  const fnMatch = src.match(/export async function deregisterPushToken\(\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(fnMatch, 'deregisterPushToken not found');
  const body = fnMatch[1];
  assert.ok(body.trim().startsWith('resetPushRegistration();'), 'resetPushRegistration() must be the first statement');
  const tryIdx = body.indexOf('try {');
  const callIdx = body.indexOf('userAPI.deregisterPushToken()');
  const catchIdx = body.indexOf('catch (err)');
  assert.ok(tryIdx >= 0 && tryIdx < callIdx && callIdx < catchIdx, 'userAPI.deregisterPushToken() must be inside the try block');
  assert.ok(!/throw/.test(body.slice(catchIdx)), 'catch must not rethrow');
});

// ── register_guard_armed_only_when_epoch_unchanged (R2 / S14) ──────────────
test('register_guard_armed_only_when_epoch_unchanged', () => {
  const src = readMobile('src/services/NotificationService.js');
  const fnMatch = src.match(/export async function registerExpoPushToken\(\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(fnMatch);
  const body = fnMatch[1];
  const epochIdx = body.indexOf('const epoch = registrationEpoch;');
  assert.ok(epochIdx >= 0, 'const epoch = registrationEpoch; not found');
  const firstAwaitIdx = body.indexOf('await ');
  assert.ok(firstAwaitIdx === -1 || epochIdx < firstAwaitIdx, 'epoch must be captured before the first await');
  const assignIdx = body.indexOf('lastRegisteredExpoToken = expoPushToken;');
  assert.ok(assignIdx > epochIdx, 'lastRegisteredExpoToken assignment must come after epoch capture');
  const guardIdx = body.lastIndexOf('if (epoch === registrationEpoch)', assignIdx);
  assert.ok(guardIdx >= 0 && guardIdx < assignIdx, 'the assignment must be guarded by if (epoch === registrationEpoch)');
  const registerCallIdx = body.indexOf('userAPI.registerPushToken(');
  assert.ok(registerCallIdx >= 0 && registerCallIdx < assignIdx, 'the assignment must come after userAPI.registerPushToken(...)');
});

// ── push_functions_take_no_arguments (R2 / S15) ─────────────────────────────
test('push_functions_take_no_arguments', () => {
  const src = readMobile('src/services/NotificationService.js');
  assert.match(src, /export async function registerExpoPushToken\(\)/);
  assert.match(src, /export async function deregisterPushToken\(\)/);
  const files = ['App.js', ...listMobileFiles('src')];
  for (const rel of files) {
    const fileSrc = readMobile(rel);
    assert.ok(!/\b(registerExpoPushToken|deregisterPushToken)\([^)]/.test(fileSrc), `${rel}: call passes an argument`);
  }
});

// ── handleLogout_deregisters_before_clearing_token (R2 / S16) ──────────────
test('handleLogout_deregisters_before_clearing_token', () => {
  const src = readMobile('App.js');
  const fnMatch = src.match(/const handleLogout = async \(\{ alreadyDeregistered = false \} = \{\}\) => \{([\s\S]*?)\n  \};/);
  assert.ok(fnMatch, 'handleLogout signature/body not found');
  const body = fnMatch[1];
  const deregisterIdx = body.indexOf('await deregisterPushToken();');
  const resetIdx = body.indexOf('resetPushRegistration();');
  const logoutIdx = body.indexOf('await authAPI.logout();');
  assert.ok(deregisterIdx >= 0 && logoutIdx >= 0 && deregisterIdx < logoutIdx, 'deregisterPushToken() must precede authAPI.logout()');
  assert.ok(resetIdx >= 0, 'the else branch must call resetPushRegistration()');
  for (const target of ['clearInterval(pollRef.current)', 'setPreloaded(null)', 'setUnreadCount(0)', 'setShowTour(false)', 'setIsLoggedIn(false)']) {
    assert.ok(body.indexOf(target) > logoutIdx, `${target} must come after authAPI.logout()`);
  }
});

// ── logout_and_expiry_remove_note_visibility_key (R2/R5/R11 / S45) ─────────
test('logout_and_expiry_remove_note_visibility_key', () => {
  const src = readMobile('App.js');
  const matches = src.match(/AsyncStorage\.removeItem\(NOTE_VISIBILITY_KEY\)/g) || [];
  assert.equal(matches.length, 2, `expected exactly 2 removeItem(NOTE_VISIBILITY_KEY) calls, found ${matches.length}`);
  const logoutBody = src.match(/const handleLogout = async[\s\S]*?\n  \};/);
  const expiredBody = src.match(/const handleSessionExpired = \(\) => \{[\s\S]*?\n  \};/);
  assert.ok(logoutBody && /AsyncStorage\.removeItem\(NOTE_VISIBILITY_KEY\)/.test(logoutBody[0]));
  assert.ok(expiredBody && /AsyncStorage\.removeItem\(NOTE_VISIBILITY_KEY\)/.test(expiredBody[0]));
});

// ── handleSessionExpired_resets_push_guard_and_state (R5 / S29) ────────────
test('handleSessionExpired_resets_push_guard_and_state', () => {
  const src = readMobile('App.js');
  const match = src.match(/const handleSessionExpired = \(\) => \{([\s\S]*?)\n  \};/);
  assert.ok(match);
  const body = match[1];
  for (const call of ['resetPushRegistration()', 'clearInterval(pollRef.current)', 'setPreloaded(null)', 'setUnreadCount(0)', 'setShowTour(false)', 'setTransitioning(false)', 'setIsLoggedIn(false)', 'setAuthChecked(true)']) {
    assert.ok(body.includes(call), call);
  }
  assert.ok(!/deregisterPushToken\(\)/.test(body), 'handleSessionExpired must not try to deregister an already-invalid token');
});

// ── screens_never_clear_token_directly (R5 / S18) ───────────────────────────
test('screens_never_clear_token_directly', () => {
  const files = [...listMobileFiles('src/screens'), ...listMobileFiles('src/components')];
  for (const rel of files) {
    const src = readMobile(rel);
    assert.ok(!/authAPI\.logout|removeItem\(['"]bt_token/.test(src), rel);
  }
});

// ── settings_delete_order_deregister_delete_logout (R2 / S19) ──────────────
test('settings_delete_order_deregister_delete_logout', () => {
  const src = readMobile('src/screens/SettingsScreen.js');
  assert.match(src, /import \{ deregisterPushToken \} from '\.\.\/services\/NotificationService';/);
  const deregisterIdx = src.indexOf('await deregisterPushToken()');
  const deleteIdx = src.indexOf('await profileAPI.deleteAccount()');
  const logoutIdx = src.indexOf('onLogout?.({ alreadyDeregistered: true })');
  assert.ok(deregisterIdx >= 0 && deleteIdx > deregisterIdx && logoutIdx > deleteIdx, 'expected deregister -> delete -> logout in source order');
});

// ── interceptor_uses_policy_helpers_and_notifies_once (R5 / S26) ───────────
test('interceptor_uses_policy_helpers_and_notifies_once', () => {
  const src = readMobile('src/services/api.js');
  assert.match(src, /import \{ isAuthExpiredError, isRetryableRequest \} from '\.\/httpPolicy';/);
  assert.match(src, /export const setAuthExpiredHandler/);
  assert.equal((src.match(/(?:===|==)\s*401\b/g) || []).length, 0, 'api.js must not compare against 401 directly; use httpPolicy.js');

  const respMatch = src.match(/api\.interceptors\.response\.use\(([\s\S]*?)\n\);/);
  assert.ok(respMatch, 'api.interceptors.response.use(...) block not found');
  const block = respMatch[1];
  const authIdx = block.indexOf('isAuthExpiredError(error)');
  assert.ok(authIdx >= 0);
  const removeIdx = block.indexOf("AsyncStorage.removeItem('bt_token')");
  assert.ok(removeIdx > authIdx);
  const flagSetIdx = block.indexOf('authExpiredNotified = true;');
  const handlerCallIdx = block.indexOf('authExpiredHandler?.()');
  assert.ok(flagSetIdx > removeIdx && handlerCallIdx > flagSetIdx, 'authExpiredNotified must be set before calling authExpiredHandler');
  const rejectIdx = block.lastIndexOf('return Promise.reject(error);');
  assert.ok(rejectIdx > handlerCallIdx);
});

// ── saveToken_resets_authExpiredNotified_first (R5 / S27) ──────────────────
test('saveToken_resets_authExpiredNotified_first', () => {
  const src = readMobile('src/services/api.js');
  const match = src.match(/saveToken: async \(token\) => \{([^}]*)\},/);
  assert.ok(match);
  const body = match[1];
  const flagIdx = body.indexOf('authExpiredNotified = false;');
  const setItemIdx = body.indexOf("AsyncStorage.setItem('bt_token', token)");
  assert.ok(flagIdx >= 0 && setItemIdx > flagIdx);
});

// ── preload_followed_by_isLoggedIn_recheck (R5 / S30) ──────────────────────
test('preload_followed_by_isLoggedIn_recheck', () => {
  const src = readMobile('App.js');
  assert.match(src, /await preloadData\(\);\s*\n\s*if \(!\(await authAPI\.isLoggedIn\(\)\)\) \{ setAuthChecked\(true\); return; \}/);
  assert.match(src, /await preloadData\(\);\s*\n\s*if \(!\(await authAPI\.isLoggedIn\(\)\)\) \{ setTransitioning\(false\); return; \}/);
});

// ── retry_block_precedes_401_block (R15 / S56) ──────────────────────────────
test('retry_block_precedes_401_block', () => {
  const src = readMobile('src/services/api.js');
  const retryIdx = src.indexOf('isRetryableRequest(error)');
  const authIdx = src.indexOf('isAuthExpiredError(error)');
  assert.ok(retryIdx >= 0 && authIdx > retryIdx, 'the retry check must come before the auth-expired check');
  assert.match(src, /async \(error\) => \{/, 'the response interceptor error handler must be async');
});

// ── cold_start_timeout_only_upgrades_default (R15 / S54) ───────────────────
test('cold_start_timeout_only_upgrades_default', () => {
  const src = readMobile('src/services/api.js');
  assert.match(src, /const DEFAULT_TIMEOUT = 30000;/);
  assert.match(src, /const COLD_START_TIMEOUT = 45000;/);
  assert.match(src, /let coldStart = true;/);
  assert.match(src, /timeout: DEFAULT_TIMEOUT,/);
  assert.match(src, /if \(coldStart && config\.timeout === DEFAULT_TIMEOUT\) config\.timeout = COLD_START_TIMEOUT;/);
  assert.match(src, /\(response\) => \{ coldStart = false; return response; \}/);
  assert.match(src, /cfg\.__retried = true;/);
  assert.match(src, /cfg\.timeout = DEFAULT_TIMEOUT;/);
  assert.match(src, /await sleep\(2000\);/);
  assert.match(src, /return api\(cfg\);/);
});

// ── every_note_create_and_update_sends_is_public (R11 / S41 — Package C) ──
test('every_note_create_and_update_sends_is_public', () => {
  const expectations = [
    { file: 'src/screens/FeedScreen.js', method: 'createNote', count: 2 },
    { file: 'src/screens/BookDetailScreen.js', method: 'createNote', count: 1 },
    { file: 'src/screens/ProfileScreen.js', method: 'createNote', count: 1 },
    { file: 'src/screens/ProfileScreen.js', method: 'updateNote', count: 1 },
  ];
  for (const { file, method, count } of expectations) {
    const ast = parseMobileFile(file);
    const calls = findApiCalls(ast, 'notesAPI', method);
    assert.equal(calls.length, count, `${file}: notesAPI.${method} call count`);
    for (const call of calls) {
      const objArg = call.arguments.find((a) => a.type === 'ObjectExpression');
      assert.ok(objArg, `${file}: ${method} call has no options object`);
      const prop = objArg.properties.find((p) => p.key?.name === 'is_public');
      assert.ok(prop, `${file}: ${method} call missing is_public`);
      assert.equal(prop.value.type, 'Identifier', `${file}: ${method} is_public must be a variable, not a literal`);
    }
  }
});

// ── use_note_visibility_defaults_private_and_rereads_on_focus (R11 / S42 — Package C) ──
test('use_note_visibility_defaults_private_and_rereads_on_focus', () => {
  const src = readMobile('src/components/VisibilityToggle.js');
  assert.match(src, /useState\(false\)/);
  assert.match(src, /useEffect\(\(\) => \{\s*if \(!isFocused\) return;/);
  assert.match(src, /AsyncStorage\.getItem\(NOTE_VISIBILITY_KEY\)/);
  assert.match(src, /parseStoredVisibility\(v\)/);
  assert.match(src, /AsyncStorage\.setItem\(NOTE_VISIBILITY_KEY, serializeVisibility\(next\)\)/);
  assert.match(src, /from '\.\.\/services\/api'/);
  assert.match(src, /useIsFocused.*from '@react-navigation\/native'/);
  const effectDeps = src.match(/\}, \[(.*?)\]\);/);
  assert.ok(effectDeps && effectDeps[1].trim() === 'isFocused');
});

// ── no_visibility_reset_after_posting (R11 / S43) ───────────────────────────
test('no_visibility_reset_after_posting', () => {
  for (const rel of listMobileFiles('src/screens')) {
    const src = readMobile(rel);
    assert.ok(!/set(IsPublic|NoteIsPublic|RememberedPublic)\((false|true)\)/.test(src), rel);
  }
});

// ── profile_edit_uses_local_editPublic (R11 / S44 — Package C) ─────────────
test('profile_edit_uses_local_editPublic', () => {
  const src = readMobile('src/screens/ProfileScreen.js');
  assert.match(src, /const \[editPublic, setEditPublic\] = useState\(false\)/);
  assert.match(src, /setEditPublic\(!!editNote\?\.is_public\)/);
  assert.match(src, /is_public:\s*editPublic/);
  assert.match(src, /isPublic=\{editNote \? editPublic : rememberedPublic\}/);
  assert.match(src, /onChange=\{editNote \? setEditPublic : setRememberedPublic\}/);
});

// ── feed_saved_privately_toast_on_both_create_paths (R11 / S46 — Package C) ─
test('feed_saved_privately_toast_on_both_create_paths', () => {
  const src = readMobile('src/screens/FeedScreen.js');
  assert.match(src, /ToastAndroid/);
  const toastCalls = (src.match(/ToastAndroid\.show\(t\('notes\.savedPrivately'\), ToastAndroid\.SHORT\)/g) || []).length;
  assert.ok(toastCalls >= 1, 'expected notes.savedPrivately toast');
  assert.match(src, /Platform\.OS === 'android'/);
  assert.match(src, /const postedPublic = isPublic/);
});

// ── disband_gated_on_created_by (R3 / S22 — Package B) ──────────────────────
test('disband_gated_on_created_by', () => {
  const ast = parseMobileFile('src/screens/GroupDetailScreen.js');
  const found = findAll(ast, (n) => n.type === 'LogicalExpression' && n.operator === '&&').some((n) => {
    let mentionsCreatedBy = false;
    let mentionsCurrentUser = false;
    walk(n.left, (m) => {
      if (m.type === 'MemberExpression' && m.property.type === 'Identifier' && m.property.name === 'created_by') mentionsCreatedBy = true;
      if (m.type === 'Identifier' && m.name === 'currentUser') mentionsCurrentUser = true;
    });
    return mentionsCreatedBy && mentionsCurrentUser;
  });
  assert.ok(found, 'expected a `group?.created_by === currentUser?.id` style gate for Disband');
});

// ── groups_focus_effect_reloads_mine (R3 / S23 — Package B) ────────────────
test('groups_focus_effect_reloads_mine', () => {
  const ast = parseMobileFile('src/screens/GroupsScreen.js');
  const useFocusCalls = findAll(ast, (n) => n.type === 'CallExpression' && n.callee.name === 'useFocusEffect');
  assert.ok(useFocusCalls.length > 0, 'useFocusEffect not found');
  const found = useFocusCalls.some((call) => {
    const useCallbackCall = call.arguments[0];
    if (!useCallbackCall || useCallbackCall.callee?.name !== 'useCallback') return false;
    const [fn, deps] = useCallbackCall.arguments;
    let callsLoadMine = false;
    let callsLoadPending = false;
    walk(fn.body, (n) => {
      if (n.type === 'CallExpression' && n.callee.name === 'loadMine') callsLoadMine = true;
      if (n.type === 'CallExpression' && n.callee.name === 'loadPending') callsLoadPending = true;
    });
    const depsHaveLoadMine = deps?.elements?.some((e) => e?.name === 'loadMine');
    return callsLoadMine && callsLoadPending && depsHaveLoadMine;
  });
  assert.ok(found, 'useFocusEffect must call loadMine() and loadPending(), with loadMine in deps');
});

// ── group_detail_load_arity_matches (R9 / S37, RG09 — Package B) ───────────
test('group_detail_load_arity_matches', () => {
  const ast = parseMobileFile('src/screens/GroupDetailScreen.js');
  let promiseAllArray = null;
  let destructurePattern = null;
  walk(ast.program, (n) => {
    if (n.type === 'VariableDeclarator' && n.id.type === 'ArrayPattern' && n.init?.type === 'AwaitExpression'
      && n.init.argument.type === 'CallExpression' && n.init.argument.callee.property?.name === 'all') {
      destructurePattern = n.id;
      promiseAllArray = n.init.argument.arguments[0];
    }
  });
  assert.ok(promiseAllArray && destructurePattern, 'Promise.all([...]) destructure not found in load()');
  assert.equal(destructurePattern.elements.length, promiseAllArray.elements.length, 'destructure arity must match Promise.all array length');
  const hasGoalCall = promiseAllArray.elements.some((el) => {
    let found = false;
    walk(el, (n) => { if (n.type === 'CallExpression' && n.callee.property?.name === 'getGroupGoal') found = true; });
    return found;
  });
  assert.ok(hasGoalCall, 'load() must fetch groupsAPI.getGroupGoal(groupId)');
});

// ── reject_requires_confirm_with_cancel_first (R14 / S52 — Package B) ──────
test('reject_requires_confirm_with_cancel_first', () => {
  const ast = parseMobileFile('src/screens/GroupDetailScreen.js');
  const handleReject = findAll(ast, (n) => n.type === 'VariableDeclarator' && n.id.name === 'handleReject')[0];
  assert.ok(handleReject, 'handleReject not found');
  let alertCall = null;
  walk(handleReject.init, (n) => {
    // The confirm dialog is the 3-arg Alert.alert; handleReject also has a 2-arg error Alert
    // inside the onPress catch (architecture T-14 specimen), which must not be the one inspected.
    if (!alertCall && n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.object.name === 'Alert' && n.callee.property.name === 'alert' && n.arguments.length === 3) alertCall = n;
  });
  assert.ok(alertCall, 'Alert.alert(...) not found in handleReject');
  const buttons = alertCall.arguments[2];
  assert.equal(buttons.type, 'ArrayExpression');
  const first = buttons.elements[0];
  const firstStyle = first.properties.find((p) => p.key.name === 'style');
  assert.equal(firstStyle.value.value, 'cancel');
  assert.ok(!first.properties.some((p) => p.key.name === 'onPress'), 'the cancel button must not call the API');
  const second = buttons.elements[1];
  const secondStyle = second.properties.find((p) => p.key.name === 'style');
  assert.equal(secondStyle.value.value, 'destructive');
  let callsReject = false;
  walk(second, (n) => { if (n.type === 'CallExpression' && n.callee.property?.name === 'rejectGroupMember') callsReject = true; });
  assert.ok(callsReject);
  const src = readMobile('src/screens/GroupDetailScreen.js');
  assert.equal((src.match(/rejectGroupMember\(/g) || []).length, 1, 'rejectGroupMember must be called only from the confirm button');
});

// ── apptour_reads_results_and_maps_fields (R6 / S33 — Package A) ──────────
test('apptour_reads_results_and_maps_fields', () => {
  const src = readMobile('src/components/AppTour.js');
  assert.match(src, /Array\.isArray\(res\?\.results\)/);
  assert.match(src, /google_books_id: b\.google_id,/);
  assert.match(src, /author: b\.authors\?\.join\(', '\) \|\| '',/);
  assert.match(src, /isbn: b\.isbn_13 \|\| b\.isbn_10 \|\| null,/);
  assert.match(src, /total_pages:\s*book\.total_pages \|\| null,/);
  assert.match(src, /isbn:\s*book\.isbn,/);
});

// ── book_preview_book_id_never_from_userbook (R10 / S38 — Package C) ───────
test('book_preview_book_id_never_from_userbook', () => {
  const src = readMobile('src/screens/BookPreviewScreen.js');
  assert.match(src, /rawBook\.book \? rawBook\.book\.id : \(rawBook\.status == null \? rawBook\.id : null\)/);
  assert.match(src, /book_id: localBookId \?\? null,/);
  assert.match(src, /isbn: book\.isbn \|\| null,/);
  assert.equal((src.match(/book_id:/g) || []).length, 1, 'book_id should be assigned exactly once in the payload');
});

// ── goal_card_reads_goal_endpoint_fields (R9 / S37 — Package B) ────────────
test('goal_card_reads_goal_endpoint_fields', () => {
  const src = readMobile('src/screens/GroupDetailScreen.js');
  assert.match(src, /goal\?\.goal_pages > 0/);
  assert.match(src, /goal\.pages_read \?\? 0/);
  assert.match(src, /goal\.goal_pages\.toLocaleString\(\)/);
  assert.match(src, /Math\.min\(100, goal\.pct \?\? 0\)/);
  assert.ok(!/goal\.goal_period/.test(src), 'the card must not read goal.goal_period');
});

// ── insights_profile_read_canonical_fields (R7/R8 / S34, S35 — Package C) ──
test('insights_profile_read_canonical_fields', () => {
  const insights = readMobile('src/screens/InsightsScreen.js');
  const profile = readMobile('src/screens/ProfileScreen.js');
  for (const stale of ['yearGoal.finished', 'average_rating', 'books_this_year', 'books_finished_this_year', 'projected_finish_date', 'finished_books']) {
    assert.ok(!insights.includes(stale), `InsightsScreen.js still reads ${stale}`);
    assert.ok(!profile.includes(stale), `ProfileScreen.js still reads ${stale}`);
  }
  assert.match(insights, /insights\?\.total_finished/);
  assert.match(insights, /insights\?\.avg_rating/);
  assert.match(insights, /insights\?\.finished_this_year/);
  assert.match(insights, /proj\.projected_finish\b/);
  assert.match(insights, /proj\?\.projected_finish &&/);
  assert.match(insights, /yearGoal\.completed \?\? 0/);
  assert.ok((profile.match(/yearGoal\.completed \?\? 0/g) || []).length >= 2, 'ProfileScreen.js must read yearGoal.completed in at least 2 places');
});

// ── feed_flatlist_header_is_element_and_extraData_complete (R19 / S63 — Package C) ──
test('feed_flatlist_header_is_element_and_extraData_complete', () => {
  const ast = parseMobileFile('src/screens/FeedScreen.js');
  const src = readMobile('src/screens/FeedScreen.js');
  assert.match(src, /FlatList/);
  const flatLists = findAll(ast, (n) => n.type === 'JSXElement' && n.openingElement.name.name === 'FlatList');
  assert.equal(flatLists.length, 1, 'expected exactly one FlatList element');
  const el = flatLists[0].openingElement;
  const attr = (name) => el.attributes.find((a) => a.name?.name === name);
  assert.ok(attr('keyExtractor'));
  const headerAttr = attr('ListHeaderComponent');
  assert.ok(headerAttr, 'ListHeaderComponent missing');
  const headerVal = headerAttr.value.type === 'JSXExpressionContainer' ? headerAttr.value.expression : headerAttr.value;
  assert.ok(['JSXElement', 'JSXFragment'].includes(headerVal.type), 'ListHeaderComponent must be an element/fragment, not a function');
  const extraDataAttr = attr('extraData');
  assert.ok(extraDataAttr);
  const extraDataExpr = extraDataAttr.value.expression;
  assert.equal(extraDataExpr.type, 'ObjectExpression');
  const keys = extraDataExpr.properties.map((p) => p.key.name);
  assert.ok(keys.includes('expandedComments') && keys.includes('menuPostId'));
  const rcsAttr = attr('removeClippedSubviews');
  assert.equal(rcsAttr.value.expression.value, false);
  assert.ok(attr('keyboardShouldPersistTaps'));
  assert.ok(attr('refreshControl'));
  assert.ok(attr('ListEmptyComponent'));
  assert.ok(!src.includes('Math.random()'), 'renderPost must not fall back to Math.random() keys');
});

// ── preload_keys_unchanged (RG02 — Package A, untouched by 4B) ────────────
test('preload_keys_unchanged', () => {
  const ast = parseMobileFile('App.js');
  const preloadDataFn = findAll(ast, (n) => n.type === 'VariableDeclarator' && n.id.name === 'preloadData')[0];
  assert.ok(preloadDataFn);
  let allSettledArray = null;
  let arrayPattern = null;
  walk(preloadDataFn.init.body, (n) => {
    if (n.type === 'VariableDeclarator' && n.id.type === 'ArrayPattern' && n.init?.type === 'AwaitExpression'
      && n.init.argument.callee?.property?.name === 'allSettled') {
      arrayPattern = n.id;
      allSettledArray = n.init.argument.arguments[0];
    }
  });
  assert.ok(allSettledArray && arrayPattern);
  assert.equal(allSettledArray.elements.length, 9);
  assert.equal(arrayPattern.elements.length, 9);

  let setPreloadedCall = null;
  walk(preloadDataFn.init.body, (n) => {
    if (n.type === 'CallExpression' && n.callee.name === 'setPreloaded' && n.arguments[0]?.type === 'ObjectExpression') setPreloadedCall = n;
  });
  assert.ok(setPreloadedCall);
  const keys = setPreloadedCall.arguments[0].properties.map((p) => p.key.name);
  assert.deepEqual(keys, ['profile', 'library', 'feed', 'insights', 'activity', 'notes', 'groups', 'pendingGroups']);

  assert.match(readMobile('App.js'), /count\.value\?\.unread \?\? 0/);
});
