<script setup lang="ts">
const title: string = "Hello";
</script>
<template>
  <h1 class="title">{{ title.toUpperCase() }}</h1>
</template>
<style>
.title { color: red; }
</style>
