import assert from 'node:assert/strict';
import {test} from 'node:test';
import {loadModule} from './helpers/load-ts.mjs';
const {ratingShortcut}=loadModule('lib/captions/rating-shortcuts.ts');
const event=(extra={})=>({key:'ArrowUp',target:{closest:()=>null},...extra});
test('arrows map to the same two choices; unrelated keys scroll normally',()=>{assert.equal(ratingShortcut(event(),false,false),1);assert.equal(ratingShortcut(event({key:'ArrowDown'}),false,false),-1);assert.equal(ratingShortcut(event({key:'ArrowLeft'}),false,false),null);});
for(const key of ['repeat','defaultPrevented','altKey','ctrlKey','metaKey','shiftKey','isComposing'])test(`ignores ${key}`,()=>assert.equal(ratingShortcut(event({[key]:true}),false,false),null));
test('pending, overlays and editable targets never rate',()=>{assert.equal(ratingShortcut(event(),true,false),null);assert.equal(ratingShortcut(event(),false,true),null);assert.equal(ratingShortcut(event({target:{closest:()=>({})}}),false,false),null);});
