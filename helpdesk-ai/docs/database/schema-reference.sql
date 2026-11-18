--
-- PostgreSQL database dump
--

\restrict ShduAXe6IFofY9cOcwVCatGPsRk5Qow3V5Nm9qgVyxUcD6h3DigIIFNckqMT1k3

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: PolicyRuleType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PolicyRuleType" AS ENUM (
    'GREETING_PATTERN',
    'IN_SCOPE_KEYWORD',
    'OUT_OF_SCOPE_KEYWORD',
    'IN_SCOPE_INTENT',
    'SAFETY_BLOCK_KEYWORD'
);


--
-- Name: Role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Role" AS ENUM (
    'USER',
    'ADMIN'
);


--
-- Name: SimulationSessionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SimulationSessionStatus" AS ENUM (
    'PROVISIONING',
    'READY',
    'ACTIVE',
    'TERMINATING',
    'ENDED',
    'FAILED'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: AdminAuditLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AdminAuditLog" (
    id bigint NOT NULL,
    "actorId" integer NOT NULL,
    method text NOT NULL,
    path text NOT NULL,
    status integer NOT NULL,
    at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    metadata jsonb
);


--
-- Name: AdminAuditLog_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AdminAuditLog_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AdminAuditLog_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AdminAuditLog_id_seq" OWNED BY public."AdminAuditLog".id;


--
-- Name: ChatSession; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ChatSession" (
    "userId" integer NOT NULL,
    id text NOT NULL,
    data jsonb NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: ChatTurn; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ChatTurn" (
    id text NOT NULL,
    "userId" integer NOT NULL,
    "sessionId" text NOT NULL,
    "userMessageId" text NOT NULL,
    "assistantMessageId" text NOT NULL,
    message text NOT NULL,
    reply text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: PolicyConfig; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PolicyConfig" (
    id integer DEFAULT 1 NOT NULL,
    messages jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "updatedById" integer,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: PolicyConversation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PolicyConversation" (
    id text NOT NULL,
    "userId" integer NOT NULL,
    "sessionId" text NOT NULL,
    scope text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "expiresAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    history jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: PolicyEvent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PolicyEvent" (
    id text NOT NULL,
    at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "userId" integer,
    "userEmail" text NOT NULL,
    message text NOT NULL,
    blocked boolean DEFAULT false NOT NULL,
    code text NOT NULL,
    reason text NOT NULL,
    "hasHistory" boolean DEFAULT false NOT NULL,
    "sessionId" text,
    "requestId" text,
    outcome text,
    stage text,
    metadata jsonb
);


--
-- Name: PolicyRule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PolicyRule" (
    id text NOT NULL,
    type public."PolicyRuleType" NOT NULL,
    value text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    "createdById" integer,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: PromptInsightDismissal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PromptInsightDismissal" (
    key text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: RefreshToken; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."RefreshToken" (
    id integer NOT NULL,
    token text NOT NULL,
    "userId" integer NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: RefreshToken_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."RefreshToken_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: RefreshToken_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."RefreshToken_id_seq" OWNED BY public."RefreshToken".id;


--
-- Name: RequestLimit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."RequestLimit" (
    key text NOT NULL,
    hits integer NOT NULL,
    "resetAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: SessionRestriction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SessionRestriction" (
    "userId" integer NOT NULL,
    "sessionId" text NOT NULL,
    "windowStart" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    violations integer DEFAULT 0 NOT NULL,
    "expiresAt" timestamp(3) without time zone,
    reason text,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: SimulationAttempt; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SimulationAttempt" (
    id text NOT NULL,
    "userId" integer NOT NULL,
    "moduleId" text NOT NULL,
    surface text NOT NULL,
    expected jsonb NOT NULL,
    "nextStep" integer DEFAULT 0 NOT NULL,
    mistakes integer DEFAULT 0 NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: SimulationCompletion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SimulationCompletion" (
    id text NOT NULL,
    "userId" integer NOT NULL,
    "moduleId" text NOT NULL,
    "attemptKey" text NOT NULL,
    surface text NOT NULL,
    "stepsCompleted" integer NOT NULL,
    "completedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    verification text DEFAULT 'self-reported'::text NOT NULL
);


--
-- Name: SimulationDraft; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SimulationDraft" (
    id text NOT NULL,
    "ownerId" integer NOT NULL,
    "moduleId" text,
    title text NOT NULL,
    category text NOT NULL,
    difficulty text DEFAULT 'Medium'::text NOT NULL,
    "sourcePrompt" text,
    simulation jsonb NOT NULL,
    generation jsonb,
    state text DEFAULT 'DRAFT'::text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: SimulationModule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SimulationModule" (
    id text NOT NULL,
    title text NOT NULL,
    category text NOT NULL,
    difficulty text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    completions integer DEFAULT 0 NOT NULL,
    "passRate" double precision DEFAULT 0 NOT NULL,
    "avgSteps" double precision DEFAULT 0 NOT NULL,
    "sourcePrompt" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    simulation jsonb,
    revision integer DEFAULT 1 NOT NULL,
    "createdById" integer,
    "updatedById" integer,
    "publishedAt" timestamp(3) without time zone
);


--
-- Name: SimulationRevision; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SimulationRevision" (
    id text NOT NULL,
    "moduleId" text NOT NULL,
    revision integer NOT NULL,
    "actorId" integer,
    snapshot jsonb NOT NULL,
    "testReceiptId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: SimulationSession; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SimulationSession" (
    id text NOT NULL,
    "userId" integer NOT NULL,
    "moduleId" text NOT NULL,
    surface text NOT NULL,
    status public."SimulationSessionStatus" DEFAULT 'PROVISIONING'::public."SimulationSessionStatus" NOT NULL,
    "ec2InstanceId" text,
    "privateIp" text,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "endedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "chatSessionId" text
);


--
-- Name: SimulationTestReceipt; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SimulationTestReceipt" (
    id text NOT NULL,
    "actorId" integer NOT NULL,
    "definitionHash" text NOT NULL,
    definition jsonb NOT NULL,
    events jsonb NOT NULL,
    mistakes integer NOT NULL,
    "stepsCompleted" integer NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: User; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."User" (
    id integer NOT NULL,
    email text NOT NULL,
    "passwordHash" text NOT NULL,
    "firstName" text NOT NULL,
    "lastName" text NOT NULL,
    role public."Role" DEFAULT 'USER'::public."Role" NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "mustChangePassword" boolean DEFAULT false NOT NULL,
    "tokenVersion" integer DEFAULT 0 NOT NULL
);


--
-- Name: UserSessionState; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."UserSessionState" (
    id integer NOT NULL,
    "userId" integer NOT NULL,
    sessions jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: UserSessionState_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."UserSessionState_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: UserSessionState_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."UserSessionState_id_seq" OWNED BY public."UserSessionState".id;


--
-- Name: User_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."User_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: User_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."User_id_seq" OWNED BY public."User".id;


--
-- Name: AdminAuditLog id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AdminAuditLog" ALTER COLUMN id SET DEFAULT nextval('public."AdminAuditLog_id_seq"'::regclass);


--
-- Name: RefreshToken id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RefreshToken" ALTER COLUMN id SET DEFAULT nextval('public."RefreshToken_id_seq"'::regclass);


--
-- Name: User id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User" ALTER COLUMN id SET DEFAULT nextval('public."User_id_seq"'::regclass);


--
-- Name: UserSessionState id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserSessionState" ALTER COLUMN id SET DEFAULT nextval('public."UserSessionState_id_seq"'::regclass);


--
-- Name: AdminAuditLog AdminAuditLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AdminAuditLog"
    ADD CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY (id);


--
-- Name: ChatSession ChatSession_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChatSession"
    ADD CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("userId", id);


--
-- Name: ChatTurn ChatTurn_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChatTurn"
    ADD CONSTRAINT "ChatTurn_pkey" PRIMARY KEY (id);


--
-- Name: PolicyConfig PolicyConfig_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PolicyConfig"
    ADD CONSTRAINT "PolicyConfig_pkey" PRIMARY KEY (id);


--
-- Name: PolicyConversation PolicyConversation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PolicyConversation"
    ADD CONSTRAINT "PolicyConversation_pkey" PRIMARY KEY (id);


--
-- Name: PolicyEvent PolicyEvent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PolicyEvent"
    ADD CONSTRAINT "PolicyEvent_pkey" PRIMARY KEY (id);


--
-- Name: PolicyRule PolicyRule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PolicyRule"
    ADD CONSTRAINT "PolicyRule_pkey" PRIMARY KEY (id);


--
-- Name: PromptInsightDismissal PromptInsightDismissal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PromptInsightDismissal"
    ADD CONSTRAINT "PromptInsightDismissal_pkey" PRIMARY KEY (key);


--
-- Name: RefreshToken RefreshToken_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RefreshToken"
    ADD CONSTRAINT "RefreshToken_pkey" PRIMARY KEY (id);


--
-- Name: RequestLimit RequestLimit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RequestLimit"
    ADD CONSTRAINT "RequestLimit_pkey" PRIMARY KEY (key);


--
-- Name: SessionRestriction SessionRestriction_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionRestriction"
    ADD CONSTRAINT "SessionRestriction_pkey" PRIMARY KEY ("userId", "sessionId");


--
-- Name: SimulationAttempt SimulationAttempt_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SimulationAttempt"
    ADD CONSTRAINT "SimulationAttempt_pkey" PRIMARY KEY (id);


--
-- Name: SimulationCompletion SimulationCompletion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SimulationCompletion"
    ADD CONSTRAINT "SimulationCompletion_pkey" PRIMARY KEY (id);


--
-- Name: SimulationDraft SimulationDraft_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SimulationDraft"
    ADD CONSTRAINT "SimulationDraft_pkey" PRIMARY KEY (id);


--
-- Name: SimulationModule SimulationModule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SimulationModule"
    ADD CONSTRAINT "SimulationModule_pkey" PRIMARY KEY (id);


--
-- Name: SimulationRevision SimulationRevision_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SimulationRevision"
    ADD CONSTRAINT "SimulationRevision_pkey" PRIMARY KEY (id);


--
-- Name: SimulationSession SimulationSession_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SimulationSession"
    ADD CONSTRAINT "SimulationSession_pkey" PRIMARY KEY (id);


--
-- Name: SimulationTestReceipt SimulationTestReceipt_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SimulationTestReceipt"
    ADD CONSTRAINT "SimulationTestReceipt_pkey" PRIMARY KEY (id);


--
-- Name: UserSessionState UserSessionState_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserSessionState"
    ADD CONSTRAINT "UserSessionState_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: AdminAuditLog_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AdminAuditLog_at_idx" ON public."AdminAuditLog" USING btree (at);


--
-- Name: ChatSession_updatedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ChatSession_updatedAt_idx" ON public."ChatSession" USING btree ("updatedAt");


--
-- Name: ChatTurn_userId_sessionId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ChatTurn_userId_sessionId_createdAt_idx" ON public."ChatTurn" USING btree ("userId", "sessionId", "createdAt");


--
-- Name: PolicyConversation_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PolicyConversation_expiresAt_idx" ON public."PolicyConversation" USING btree ("expiresAt");


--
-- Name: PolicyConversation_userId_sessionId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PolicyConversation_userId_sessionId_key" ON public."PolicyConversation" USING btree ("userId", "sessionId");


--
-- Name: PolicyConversation_userId_updatedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PolicyConversation_userId_updatedAt_idx" ON public."PolicyConversation" USING btree ("userId", "updatedAt");


--
-- Name: PolicyEvent_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PolicyEvent_at_idx" ON public."PolicyEvent" USING btree (at DESC);


--
-- Name: PolicyEvent_blocked_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PolicyEvent_blocked_at_idx" ON public."PolicyEvent" USING btree (blocked, at DESC);


--
-- Name: PolicyEvent_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PolicyEvent_code_idx" ON public."PolicyEvent" USING btree (code);


--
-- Name: PolicyEvent_userId_sessionId_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PolicyEvent_userId_sessionId_at_idx" ON public."PolicyEvent" USING btree ("userId", "sessionId", at);


--
-- Name: PolicyRule_type_enabled_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PolicyRule_type_enabled_position_idx" ON public."PolicyRule" USING btree (type, enabled, "position");


--
-- Name: PolicyRule_type_value_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PolicyRule_type_value_key" ON public."PolicyRule" USING btree (type, value);


--
-- Name: RefreshToken_token_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "RefreshToken_token_key" ON public."RefreshToken" USING btree (token);


--
-- Name: RequestLimit_resetAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RequestLimit_resetAt_idx" ON public."RequestLimit" USING btree ("resetAt");


--
-- Name: SessionRestriction_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SessionRestriction_expiresAt_idx" ON public."SessionRestriction" USING btree ("expiresAt");


--
-- Name: SimulationAttempt_userId_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SimulationAttempt_userId_expiresAt_idx" ON public."SimulationAttempt" USING btree ("userId", "expiresAt");


--
-- Name: SimulationCompletion_attemptKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SimulationCompletion_attemptKey_key" ON public."SimulationCompletion" USING btree ("attemptKey");


--
-- Name: SimulationCompletion_moduleId_completedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SimulationCompletion_moduleId_completedAt_idx" ON public."SimulationCompletion" USING btree ("moduleId", "completedAt");


--
-- Name: SimulationCompletion_userId_completedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SimulationCompletion_userId_completedAt_idx" ON public."SimulationCompletion" USING btree ("userId", "completedAt");


--
-- Name: SimulationDraft_ownerId_state_updatedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SimulationDraft_ownerId_state_updatedAt_idx" ON public."SimulationDraft" USING btree ("ownerId", state, "updatedAt");


--
-- Name: SimulationRevision_moduleId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SimulationRevision_moduleId_createdAt_idx" ON public."SimulationRevision" USING btree ("moduleId", "createdAt");


--
-- Name: SimulationRevision_moduleId_revision_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SimulationRevision_moduleId_revision_key" ON public."SimulationRevision" USING btree ("moduleId", revision);


--
-- Name: SimulationSession_ec2InstanceId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SimulationSession_ec2InstanceId_key" ON public."SimulationSession" USING btree ("ec2InstanceId");


--
-- Name: SimulationSession_status_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SimulationSession_status_expiresAt_idx" ON public."SimulationSession" USING btree (status, "expiresAt");


--
-- Name: SimulationSession_userId_chatSessionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SimulationSession_userId_chatSessionId_idx" ON public."SimulationSession" USING btree ("userId", "chatSessionId");


--
-- Name: SimulationSession_userId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SimulationSession_userId_status_idx" ON public."SimulationSession" USING btree ("userId", status);


--
-- Name: SimulationTestReceipt_actorId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SimulationTestReceipt_actorId_createdAt_idx" ON public."SimulationTestReceipt" USING btree ("actorId", "createdAt");


--
-- Name: UserSessionState_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "UserSessionState_userId_key" ON public."UserSessionState" USING btree ("userId");


--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);


--
-- Name: ChatSession ChatSession_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChatSession"
    ADD CONSTRAINT "ChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON DELETE CASCADE;


--
-- Name: ChatTurn ChatTurn_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChatTurn"
    ADD CONSTRAINT "ChatTurn_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: PolicyConfig PolicyConfig_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PolicyConfig"
    ADD CONSTRAINT "PolicyConfig_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PolicyConversation PolicyConversation_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PolicyConversation"
    ADD CONSTRAINT "PolicyConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: PolicyEvent PolicyEvent_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PolicyEvent"
    ADD CONSTRAINT "PolicyEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PolicyRule PolicyRule_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PolicyRule"
    ADD CONSTRAINT "PolicyRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: RefreshToken RefreshToken_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RefreshToken"
    ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: SessionRestriction SessionRestriction_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionRestriction"
    ADD CONSTRAINT "SessionRestriction_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: SimulationAttempt SimulationAttempt_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SimulationAttempt"
    ADD CONSTRAINT "SimulationAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON DELETE CASCADE;


--
-- Name: SimulationCompletion SimulationCompletion_moduleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SimulationCompletion"
    ADD CONSTRAINT "SimulationCompletion_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES public."SimulationModule"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: SimulationCompletion SimulationCompletion_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SimulationCompletion"
    ADD CONSTRAINT "SimulationCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: SimulationDraft SimulationDraft_ownerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SimulationDraft"
    ADD CONSTRAINT "SimulationDraft_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: SimulationSession SimulationSession_moduleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SimulationSession"
    ADD CONSTRAINT "SimulationSession_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES public."SimulationModule"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: SimulationSession SimulationSession_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SimulationSession"
    ADD CONSTRAINT "SimulationSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UserSessionState UserSessionState_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserSessionState"
    ADD CONSTRAINT "UserSessionState_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict ShduAXe6IFofY9cOcwVCatGPsRk5Qow3V5Nm9qgVyxUcD6h3DigIIFNckqMT1k3

