import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorklistDetail } from '../app/alerts/WorklistDetail';
import { getReactivationPurchasedAgainMessage } from '../lib/ohlqWholesaleReactivation';
import { socialWorklistDetail, socialWorklistPostHref } from '../lib/socialPublishing/worklist';

const postId = 'cmwdtdbob0001up0kqcmrd68v';
const render = (detail: string | null) => renderToStaticMarkup(createElement(WorklistDetail, { detail }));

test('social Worklist stores only a protected post pointer and rejects unsafe post identities', () => {
  const detail = socialWorklistDetail(postId);
  assert.equal(socialWorklistPostHref(detail), `/social/${postId}`);
  for (const identity of ['', '../private', 'post?tenant=other', 'post#section', 'post/child', 'https://outside.example', 'javascript:alert(1)', 'a'.repeat(101)]) {
    assert.throws(() => socialWorklistDetail(identity), /Invalid social post identity/);
  }
});

test('social Worklist parser recognizes only the complete reserved marker with a local post route', () => {
  const detail = socialWorklistDetail(postId);
  const replacements = ['https://outside.example/social/post', '//outside.example/post', 'javascript:alert(1)', '/social/../admin', '/social/%2e%2e', '/social/post?redirect=https://outside.example', '/social/post#section', '/social/post/child', '/social/' + 'a'.repeat(101)];
  for (const replacement of replacements) assert.equal(socialWorklistPostHref(detail.replace(`/social/${postId}`, replacement)), null);
  for (const ordinary of [null, '', `/social/${postId}`, `User note: ${detail}`, `${detail}\nExtra instructions`, `${detail} `]) assert.equal(socialWorklistPostHref(ordinary), null);
});

test('team-visible Social task renders generic context and one-click protected link without its raw marker', () => {
  const detail = socialWorklistDetail(postId);
  const html = render(detail);
  assert.match(html, /Approved social post is ready for native completion\./);
  assert.match(html, new RegExp(`href="/social/${postId}"`));
  assert.match(html, />Open reviewed social post<\/a>/);
  assert.equal(html.includes(detail), false);
  assert.equal(html.includes(detail.slice(0, detail.indexOf('/social/'))), false);
  assert.doesNotMatch(html, /href="(?:https?:|javascript:|\/\/)/i);
});

test('ordinary and hostile user-defined task details retain escaped text behavior and never become Social links', () => {
  assert.equal(render(null), '');
  const ordinary = 'Call the venue manager.\n\nKeep the existing follow-up context.';
  const html = render(ordinary);
  assert.match(html, /Call the venue manager\./);
  assert.match(html, /Keep the existing follow-up context\./);
  assert.doesNotMatch(html, /<a\b/);
  const hostile = socialWorklistDetail(postId).replace(`/social/${postId}`, 'javascript:alert(1)') + '<script>unsafe()</script>';
  const hostileHtml = render(hostile);
  assert.doesNotMatch(hostileHtml, /<a\b|<script\b/i);
  assert.match(hostileHtml, /&lt;script&gt;unsafe\(\)&lt;\/script&gt;/);
});

test('existing purchased-again task warning remains separate from ordinary follow-up text', () => {
  const warning = getReactivationPurchasedAgainMessage(new Date('2026-11-12T00:00:00Z'));
  const html = render(`${warning}\n\nKeep the original follow-up.`);
  assert.match(html, /class="worklist-warning-ribbon"/);
  assert.ok(html.includes(warning));
  assert.match(html, /class="muted preserve-lines">Keep the original follow-up\./);
  assert.doesNotMatch(html, /Open reviewed social post/);
});
