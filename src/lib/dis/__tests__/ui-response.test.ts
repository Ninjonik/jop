import { DocumentCenterView } from '@/app/components/dis/DocumentCenterView';
import { ShiftManagementView } from '@/app/components/dis/ShiftManagementView';
import { ShiftPlanView } from '@/app/components/dis/ShiftPlanView';
import { StaffManagementView } from '@/app/components/dis/StaffManagementView';
import {
  Window,
  type HTMLButtonElement as TestButton,
  type HTMLSelectElement as TestSelect,
} from 'happy-dom';
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { clearDisToken } from '../api-client';
import { account, type UserProfile } from '../appwrite-client';
import { DisAuthProvider } from '../auth-context';
import { mergeChatMessages, type ChatMessage } from '../chat';
import type { EddMessage, EddSendCommand } from '../edd';
import type { PlannedShift, ShiftPlan } from '../shift-plan';
import { useDisResource } from '../use-dis-resource';
import { useEddOutbox } from '../use-edd-outbox';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
async function mountHook<T>(context: TestContext, hook: () => T, render?: () => ReactNode) {
  const window = new Window({ url: 'http://localhost' });
  const descriptors = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    localStorage: window.localStorage,
    HTMLElement: window.HTMLElement,
    Node: window.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  clearDisToken();
  context.mock.method(account, 'createJWT', async () => ({ jwt: 'test-token' }));
  const container = window.document.createElement('div');
  window.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  let value!: T;
  function Harness() {
    value = hook();
    return render?.() ?? null;
  }
  await act(async () => root.render(createElement(Harness)));
  context.after(async () => {
    await act(async () => root.unmount());
    await window.happyDOM.close();
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    clearDisToken();
  });
  return {
    container,
    window,
    get value() {
      return value;
    },
    render: async () => {
      await act(async () => root.render(createElement(Harness)));
    },
  };
}
const profile = { userId: 'operator', name: 'Operator', role: 'dispatcher' } as UserProfile;
function preset(requestId = 'dbec7bf9-59b2-4d10-9b15-73b08a6c1554') {
  const command: EddSendCommand = {
    sessionId: 'session',
    stationId: 'a',
    toStation: 'b',
    trainNumber: '101',
    kind: 'offer',
    time: '12:00',
    text: 'Original draft',
    requestId,
    wholeTrainConfirmed: false,
    stationLocative: 'A',
    stationGenitive: 'A',
  };
  const preview: EddMessage = {
    id: '',
    sessionId: 'session',
    fromStation: 'a',
    toStation: 'b',
    trainNumber: '101',
    kind: 'offer',
    time: '12:00',
    date: '2026-11-28',
    createdAt: '',
    operator: 'Operator',
    userId: 'operator',
    stationName: 'A',
    stationLocative: 'A',
    stationGenitive: 'A',
    text: 'Original draft',
  };
  return { command, preview };
}

test('preset send appears before HTTP, retains failed content and retries the identical request once', async (context) => {
  const response = deferred<Response>();
  const payloads: string[] = [];
  context.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    payloads.push(String(init.body));
    return response.promise;
  });
  const hook = await mountHook(context, () => useEddOutbox(profile));
  const { command, preview } = preset();
  let sending!: Promise<boolean>;
  await act(async () => {
    sending = hook.value.send(command, preview);
  });
  assert.equal(hook.value.messages.length, 1);
  assert.equal(hook.value.messages[0].edd?.text, 'Original draft');
  assert.equal(hook.value.messages[0].delivery, 'sending');
  assert.equal(await hook.value.retry(command.requestId), false);
  assert.equal(payloads.length, 1);
  await act(async () => {
    response.reject(new Error('Offline'));
    await sending;
  });
  assert.equal(hook.value.messages[0].delivery, 'failed');
  assert.equal(hook.value.messages[0].deliveryError, 'Offline');
  assert.equal(hook.value.messages[0].edd?.text, 'Original draft');
  context.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    payloads.push(String(init.body));
    return Response.json({ message: { ...preview, id: 'saved' } });
  });
  await act(async () => {
    assert.equal(await hook.value.retry(command.requestId), true);
  });
  assert.equal(payloads[0], payloads[1]);
  assert.equal(hook.value.messages.length, 1);
  assert.equal(hook.value.messages[0]._id, 'saved');
  assert.equal(hook.value.messages[0].delivery, undefined);
});

test('socket confirmation wins over a lost HTTP response without duplicates or false failures', async (context) => {
  const response = deferred<Response>();
  context.mock.method(globalThis, 'fetch', () => response.promise);
  const hook = await mountHook(context, () => useEddOutbox(profile));
  const { command, preview } = preset();
  let sending!: Promise<boolean>;
  await act(async () => {
    sending = hook.value.send(command, preview);
  });
  const saved: ChatMessage = {
    ...hook.value.messages[0],
    _id: 'saved',
    edd: { ...preview, id: 'saved' },
  };
  await act(async () => {
    hook.value.confirm({ ...saved, sessionId: 'other-session' });
  });
  assert.equal(hook.value.messages.length, 1);
  await act(async () => {
    hook.value.confirm(saved);
    hook.value.confirm(saved);
  });
  assert.equal(hook.value.messages.length, 0);
  let success = false;
  await act(async () => {
    response.reject(new Error('Response lost'));
    success = await sending;
  });
  assert.equal(success, true);
  assert.equal(hook.value.messages.length, 0);
  assert.equal(mergeChatMessages(hook.value.messages, [saved]).length, 1);
});

test('HTTP confirmation merges with the later socket receipt, preserving its delivered state', async (context) => {
  const { command, preview } = preset();
  context.mock.method(globalThis, 'fetch', async () =>
    Response.json({ message: { ...preview, id: 'saved' } }),
  );
  const hook = await mountHook(context, () => useEddOutbox(profile));
  await act(async () => {
    await hook.value.send(command, preview);
  });
  const saved = {
    ...hook.value.messages[0],
    edd: { ...preview, id: 'saved', deliveredAt: '2026-11-28T12:00:01Z' },
  };
  const merged = mergeChatMessages(hook.value.messages, [saved]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].edd?.deliveredAt, saved.edd.deliveredAt);
  await act(async () => hook.value.confirm(saved));
  assert.equal(hook.value.messages.length, 0);
});

test('confirmed saves invalidate older GETs and survive a failed background refresh', async (context) => {
  const initial = deferred<Response>();
  context.mock.method(globalThis, 'fetch', () => initial.promise);
  const hook = await mountHook(context, () => useDisResource('/resource', { name: 'old' }));
  let staleRead!: Promise<void>;
  await act(async () => {
    staleRead = hook.value.refresh();
  });
  await act(async () => hook.value.applyConfirmed(() => ({ name: 'saved' })));
  await act(async () => {
    initial.resolve(Response.json({ name: 'stale' }));
    await staleRead;
  });
  assert.equal(hook.value.value.name, 'saved');
  context.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Refresh unavailable');
  });
  await act(async () => hook.value.refresh());
  assert.equal(hook.value.value.name, 'saved');
  assert.equal(hook.value.error, 'Refresh unavailable');
});

test('a save response from a previous scope cannot update the newly selected resource', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => Response.json({ name: 'server' }));
  let url = '/a';
  const hook = await mountHook(context, () => useDisResource(url, { name: 'initial' }));
  const oldCommit = hook.value.applyConfirmed;
  url = '/b';
  await hook.render();
  await act(async () => oldCommit(() => ({ name: 'wrong-scope' })));
  assert.notEqual(hook.value.value.name, 'wrong-scope');
});

async function settleTimers() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}
const shift: PlannedShift = {
  $id: 'shift',
  title: 'Morning',
  date: '2026-11-28',
  startTime: '08:00',
  endTime: '10:30',
  status: 'open',
  plan: null,
};
const manager = { ...profile, role: 'dispatcher_manager' as const };
function authenticated(element: ReactNode) {
  return createElement(MemoryRouter, null, createElement(DisAuthProvider, null, element));
}

test('attendance changes immediately, locks only that row and rolls back with its error', async (context) => {
  const update = deferred<Response>();
  const bookings = ['one', 'two'].map(($id) => ({
    $id,
    shiftId: 'shift',
    userId: $id,
    userName: $id,
    assignedRole: 'dispatcher',
    assignedLocation: 'A',
    attendance: 'registered',
  }));
  context.mock.method(account, 'get', async () => ({ $id: 'operator' }));
  context.mock.method(globalThis, 'fetch', async (url: unknown, init: RequestInit) => {
    const path = String(url);
    if (path.includes('/profile')) return Response.json({ profile: manager });
    if (init.method === 'POST') return update.promise;
    if (path.includes('shiftId=')) return Response.json({ bookings, plan: null });
    if (path.endsWith('/shifts')) return Response.json({ shifts: [shift] });
    if (path.includes('/places')) return Response.json({ places: [] });
    if (path.includes('/staff')) return Response.json({ profiles: [manager] });
    throw new Error(`Unexpected request: ${path}`);
  });
  const view = await mountHook(
    context,
    () => null,
    () => authenticated(createElement(ShiftManagementView)),
  );
  await settleTimers();
  await settleTimers();
  const selects = [...view.container.querySelectorAll<TestSelect>('tbody select')];
  assert.equal(selects.length, 2);
  await act(async () => {
    selects[0].value = 'present';
    selects[0].dispatchEvent(new view.window.Event('change', { bubbles: true }));
  });
  assert.equal(selects[0].value, 'present');
  assert.equal(selects[0].disabled, true);
  assert.equal(selects[1].disabled, false);
  await act(async () =>
    update.resolve(Response.json({ error: 'Attendance rejected' }, { status: 409 })),
  );
  assert.equal(selects[0].value, 'registered');
  assert.equal(selects[0].disabled, false);
  assert.match(selects[0].closest('td')!.textContent, /Attendance rejected/);
});

test('assignment uses a local selection, keeps the confirmed plan untouched and restores on rejection', async (context) => {
  const update = deferred<Response>();
  const plan: ShiftPlan = {
    placeId: '1',
    placeName: 'Network',
    stations: [{ stationId: 'a', name: 'A' }],
    trains: [],
    assignments: [],
  };
  const commits: ShiftPlan[] = [];
  context.mock.method(globalThis, 'fetch', async (url: unknown, init: RequestInit) => {
    const path = String(url);
    if (init.method === 'POST') return update.promise;
    if (path.includes('/places')) return Response.json({ places: [] });
    if (path.includes('/staff')) return Response.json({ profiles: [manager] });
    if (path.includes('/timetables')) return Response.json({ timetables: [] });
    throw new Error(`Unexpected request: ${path}`);
  });
  const view = await mountHook(
    context,
    () => null,
    () =>
      createElement(ShiftPlanView, {
        shift: { ...shift, plan },
        canManage: true,
        onPlan: (saved) => commits.push(saved),
      }),
  );
  await settleTimers();
  const select = view.container.querySelector<TestSelect>('tbody select')!;
  assert.equal(select.value, '');
  await act(async () => {
    select.value = manager.userId;
    select.dispatchEvent(new view.window.Event('change', { bubbles: true }));
  });
  assert.equal(select.value, manager.userId);
  assert.equal(select.disabled, true);
  assert.equal(commits.length, 0);
  assert.equal(plan.assignments.length, 0);
  await act(async () =>
    update.resolve(Response.json({ error: 'Already assigned elsewhere' }, { status: 409 })),
  );
  assert.equal(select.value, '');
  assert.equal(select.disabled, false);
  assert.equal(commits.length, 0);
  assert.match(view.container.textContent, /Already assigned elsewhere/);
});

test('document save finishes from its response while list refresh is still pending, and a refresh failure keeps the save', async (context) => {
  const refresh = deferred<Response>();
  const original = {
    $id: 'doc',
    title: 'Original title',
    category: 'spp',
    contentMarkdown: 'Content',
    isPublished: true,
    authorName: 'Operator',
    $updatedAt: '2026-11-28T12:00:00Z',
  };
  const saved = { ...original, title: 'Confirmed title' };
  let reads = 0;
  context.mock.method(account, 'get', async () => ({ $id: 'operator' }));
  context.mock.method(globalThis, 'fetch', async (url: unknown, init: RequestInit) => {
    const path = String(url);
    if (path.includes('/profile')) return Response.json({ profile: manager });
    if (path.includes('/documents')) {
      if (init.method === 'POST') return Response.json({ document: saved });
      if (++reads === 1) return Response.json({ documents: [original] });
      return refresh.promise;
    }
    throw new Error(`Unexpected request: ${path}`);
  });
  const view = await mountHook(
    context,
    () => null,
    () => authenticated(createElement(DocumentCenterView)),
  );
  await settleTimers();
  await settleTimers();
  const edit = [...view.container.querySelectorAll('button')].find((button) =>
    button.textContent.includes('Upravi'),
  )!;
  assert.ok(edit);
  await act(async () => edit.click());
  const form = view.container.querySelector('form')!;
  assert.ok(form);
  await act(async () =>
    form.dispatchEvent(new view.window.Event('submit', { bubbles: true, cancelable: true })),
  );
  assert.equal(view.container.querySelector('form'), null);
  assert.match(view.container.textContent, /Confirmed title/);
  assert.equal(reads, 2);
  await act(async () =>
    refresh.resolve(Response.json({ error: 'Refresh unavailable' }, { status: 503 })),
  );
  assert.match(view.container.textContent, /Confirmed title/);
  assert.match(view.container.querySelector('[role="alert"]')!.textContent, /Refresh unavailable/);
});

test('staff assessment uses the confirmed profile and closes the dialog without another staff fetch', async (context) => {
  const employee = {
    ...profile,
    $id: 'employee',
    trainingStage: 'cadet',
    strikes: 0,
    callsign: '101',
  };
  const saved = { ...employee, trainingStage: 'certified', strikes: 2 };
  let reads = 0;
  context.mock.method(account, 'get', async () => ({ $id: 'operator' }));
  context.mock.method(globalThis, 'fetch', async (url: unknown, init: RequestInit) => {
    const path = String(url);
    if (path.includes('/profile')) return Response.json({ profile: manager });
    if (path.includes('/staff')) {
      if (init.method === 'POST') return Response.json({ profile: saved });
      reads++;
      return Response.json({ profiles: [employee] });
    }
    throw new Error(`Unexpected request: ${path}`);
  });
  const view = await mountHook(
    context,
    () => null,
    () => authenticated(createElement(StaffManagementView)),
  );
  await settleTimers();
  await settleTimers();
  const edit = view.container.querySelector<TestButton>('tbody button')!;
  assert.ok(edit);
  await act(async () => edit.click());
  const form = view.container.querySelector('dialog form')!;
  assert.ok(form);
  await act(async () =>
    form.dispatchEvent(new view.window.Event('submit', { bubbles: true, cancelable: true })),
  );
  assert.equal(view.container.querySelector('dialog'), null);
  assert.equal(reads, 1);
  assert.match(view.container.querySelector('tbody')!.textContent, /2/);
});
