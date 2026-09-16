-- Dedicated music-library schema. No browser role can read these tables.
CREATE SCHEMA IF NOT EXISTS music;
REVOKE ALL ON SCHEMA music FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS music.users(id text PRIMARY KEY,email text UNIQUE NOT NULL,name text NOT NULL,password text NOT NULL,role text NOT NULL,active integer NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS music.sessions(token text PRIMARY KEY,user_id text REFERENCES music.users(id),expires bigint NOT NULL);
CREATE TABLE IF NOT EXISTS music.classes(id text PRIMARY KEY,name text UNIQUE NOT NULL,token text UNIQUE NOT NULL,draft text NOT NULL DEFAULT '[]',published text NOT NULL DEFAULT '[]',revision integer NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS music.assignments(user_id text REFERENCES music.users(id),class_id text REFERENCES music.classes(id),PRIMARY KEY(user_id,class_id));
CREATE TABLE IF NOT EXISTS music.devices(token text PRIMARY KEY,class_id text REFERENCES music.classes(id),created_by text REFERENCES music.users(id),expires bigint NOT NULL);
CREATE TABLE IF NOT EXISTS music.pairings(token text PRIMARY KEY,user_id text REFERENCES music.users(id),expires bigint NOT NULL);
CREATE TABLE IF NOT EXISTS music.topics(name text PRIMARY KEY,position integer GENERATED ALWAYS AS IDENTITY);
CREATE TABLE IF NOT EXISTS music.songs(id text PRIMARY KEY,title text NOT NULL,tags text NOT NULL,audio_file text,cover_file text,cover_type text,emoji text NOT NULL,color text NOT NULL,archived integer NOT NULL DEFAULT 0,created_by text REFERENCES music.users(id),created_at bigint NOT NULL);
CREATE TABLE IF NOT EXISTS music.invitations(id text PRIMARY KEY,email text NOT NULL,name text NOT NULL,token text UNIQUE NOT NULL,class_ids text NOT NULL,expires bigint NOT NULL,used integer NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS music.resets(token text PRIMARY KEY,user_id text REFERENCES music.users(id),expires bigint NOT NULL,used integer NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS music.collections(id text PRIMARY KEY,class_id text REFERENCES music.classes(id),name text NOT NULL,items text NOT NULL);
CREATE TABLE IF NOT EXISTS music.attempts(key text PRIMARY KEY,count integer NOT NULL,expires bigint NOT NULL);
CREATE TABLE IF NOT EXISTS music.bootstrap(token text PRIMARY KEY,expires bigint NOT NULL);
REVOKE ALL ON ALL TABLES IN SCHEMA music FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA music FROM PUBLIC,anon,authenticated;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('music-media','music-media',false,26214400,ARRAY['audio/mpeg','image/png','image/jpeg','image/webp']) ON CONFLICT(id) DO NOTHING;
