-- DARF Productions — Supabase schema
-- 0001: extensions + shared enum types
-- Safe to run on an empty project. No data, no destructive statements.

create extension if not exists pgcrypto;

create type order_status as enum ('pendiente', 'aprobado', 'rechazado');

create type user_role as enum ('fan', 'staff');
