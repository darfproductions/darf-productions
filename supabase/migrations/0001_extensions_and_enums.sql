-- DARF Productions — Supabase schema
-- 0001: extensions + shared enum types
-- Safe to run on an empty project. No data, no destructive statements.

create extension if not exists pgcrypto;

create type order_status as enum ('pendiente', 'aprobado', 'rechazado');

-- 'admin' has full administrative permissions; 'staff' has the more limited
-- operational permissions used at the box office / check-in (approve
-- orders, block/release seats, scan tickets). 'admin' is a superset of
-- 'staff' for RLS purposes — see is_staff()/is_admin() in
-- 0009_helper_functions_and_triggers.sql.
create type user_role as enum ('fan', 'staff', 'admin');
