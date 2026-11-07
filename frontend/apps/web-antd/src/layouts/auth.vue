<script setup lang="ts">
import { CircleCheckBig, Grid, Link2, LockKeyhole } from '@vben/icons';
import { LanguageToggle, ThemeToggle } from '@vben/layouts';

import { $t } from '#/locales';
</script>

<template>
  <main class="deck-auth">
    <aside class="auth-story">
      <div class="auth-brand">
        <img src="/logo.svg" alt="" width="34" height="34" /><strong
          >DomainDeck</strong
        ><span>WORKSPACE</span>
      </div>
      <div class="auth-story-body">
        <div class="auth-orbit" aria-hidden="true">
          <div class="orbit-ring ring-inner" />
          <div class="orbit-ring ring-outer" />
          <div class="orbit-center"><Grid /></div>
          <span class="orbit-node node-one"><Link2 /></span
          ><span class="orbit-node node-two"><LockKeyhole /></span
          ><span class="orbit-node node-three"><CircleCheckBig /></span
          ><span class="orbit-dot" />
        </div>
        <div class="auth-eyebrow">YOUR DOMAIN WORKSPACE</div>
        <h1>{{ $t('deck.login.hero') }}</h1>
        <p>{{ $t('deck.login.description') }}</p>
        <div class="auth-features">
          <span>{{ $t('deck.nav.domains') }}</span
          ><span>{{ $t('deck.nav.dns') }}</span
          ><span>{{ $t('deck.nav.payments') }}</span>
        </div>
      </div>
      <div class="auth-private">
        <LockKeyhole class="size-3.5" />{{ $t('deck.shell.private') }}
      </div>
    </aside>
    <section class="auth-form-panel">
      <div class="auth-tools"><LanguageToggle /><ThemeToggle /></div>
      <div class="auth-mobile-brand">
        <img src="/logo.svg" alt="" width="30" height="30" />DomainDeck
      </div>
      <div class="auth-form-content"><RouterView /></div>
      <p class="auth-form-footer">
        DomainDeck · {{ $t('deck.shell.workspace') }}
      </p>
    </section>
  </main>
</template>

<style scoped>
.deck-auth {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 100dvh;
  background: var(--dd-surface);
}
.auth-story {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
  padding: 36px 44px;
  color: #fff;
  background: #14377b;
}
.auth-story::after {
  position: absolute;
  right: -200px;
  bottom: -300px;
  width: 650px;
  height: 650px;
  pointer-events: none;
  content: '';
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 50%;
}
.auth-brand {
  display: flex;
  gap: 10px;
  align-items: center;
  font-size: 22px;
  letter-spacing: -0.5px;
}
.auth-brand span {
  padding-left: 12px;
  margin-left: 4px;
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 2px;
  color: #b9d1fd;
  border-left: 1px solid rgb(255 255 255 / 20%);
}
.auth-story-body {
  width: 100%;
  max-width: 440px;
  margin: 24px auto 50px;
}
.auth-orbit {
  position: relative;
  width: 270px;
  height: 270px;
  margin: 0 auto 42px;
}
.orbit-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  border: 1px solid rgb(158 193 255 / 28%);
  border-radius: 50%;
  transform: translate(-50%, -50%);
}
.ring-inner {
  width: 170px;
  height: 170px;
}
.ring-outer {
  width: 270px;
  height: 270px;
  border-style: dashed;
}
.orbit-center {
  position: absolute;
  top: 95px;
  left: 95px;
  display: grid;
  width: 80px;
  height: 80px;
  color: #fff;
  background: #2563eb;
  border: 1px solid #78a7ff;
  border-radius: 24px;
  box-shadow:
    0 0 0 15px rgb(99 153 255 / 8%),
    0 15px 35px rgb(0 0 0 / 12%);
  place-items: center;
  transform: rotate(-8deg);
}
.orbit-center svg {
  width: 34px;
  height: 34px;
}
.orbit-node {
  position: absolute;
  display: grid;
  width: 44px;
  height: 44px;
  color: #c9ddff;
  background: #204b94;
  border: 1px solid rgb(158 193 255 / 40%);
  border-radius: 13px;
  place-items: center;
}
.orbit-node svg {
  width: 19px;
  height: 19px;
}
.node-one {
  top: 2px;
  left: 103px;
}
.node-two {
  top: 165px;
  right: -6px;
}
.node-three {
  top: 167px;
  left: 20px;
}
.orbit-dot {
  position: absolute;
  top: 82px;
  left: 55px;
  width: 7px;
  height: 7px;
  background: #9bc1ff;
  border-radius: 50%;
}
.auth-eyebrow {
  margin-bottom: 14px;
  font-size: var(--dd-font-small);
  letter-spacing: 2.5px;
  color: #b3d0ff;
}
.auth-story h1 {
  max-width: 440px;
  font-size: 38px;
  font-weight: 700;
  line-height: 1.5;
  letter-spacing: -1px;
}
.auth-story-body > p {
  max-width: 380px;
  margin-top: 14px;
  font-size: var(--dd-font-body);
  line-height: 1.9;
  color: #c6d8f6;
}
.auth-features {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 25px;
}
.auth-features span {
  padding: 7px 12px;
  font-size: var(--dd-font-small);
  color: #d1e1ff;
  background: rgb(255 255 255 / 5%);
  border: 1px solid rgb(255 255 255 / 20%);
  border-radius: 8px;
}
.auth-private {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: var(--dd-font-small);
  color: #bad1f4;
}
.auth-form-panel {
  position: relative;
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 90px 32px;
  color: var(--dd-text);
}
.auth-form-content {
  width: 100%;
  max-width: 390px;
}
.auth-tools {
  position: absolute;
  top: 26px;
  right: 26px;
  display: flex;
  gap: 6px;
}
.auth-form-footer {
  position: absolute;
  bottom: 28px;
  font-size: var(--dd-font-small);
  color: var(--dd-text-muted);
}
.auth-mobile-brand {
  display: none;
}
@media (width <= 900px) {
  .deck-auth {
    grid-template-columns: minmax(0, 1fr);
  }
  .auth-story {
    display: none;
  }
  .auth-form-panel {
    padding: 100px 24px 90px;
  }
  .auth-mobile-brand {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-bottom: 32px;
    font-size: 20px;
    font-weight: 650;
  }
}
</style>
