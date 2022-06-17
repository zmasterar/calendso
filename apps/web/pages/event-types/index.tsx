import { CalendarIcon } from "@heroicons/react/outline";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ClipboardCopyIcon,
  DotsHorizontalIcon,
  DuplicateIcon,
  ExternalLinkIcon,
  LinkIcon,
  PencilIcon,
  TrashIcon,
  UploadIcon,
  UsersIcon,
} from "@heroicons/react/solid";
import { UserPlan } from "@prisma/client";
import { Trans } from "next-i18next";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { Fragment, useEffect, useState } from "react";

import { CAL_URL, WEBAPP_URL } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import showToast from "@calcom/lib/notification";
import { Button } from "@calcom/ui";
import { Alert } from "@calcom/ui/Alert";
import { Dialog } from "@calcom/ui/Dialog";
import Dropdown, {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@calcom/ui/Dropdown";
import EmptyScreen from "@calcom/ui/EmptyScreen";
import { Tooltip } from "@calcom/ui/Tooltip";

import { withQuery } from "@lib/QueryCell";
import classNames from "@lib/classNames";
import { HttpError } from "@lib/core/http/error";
import { inferQueryOutput, trpc } from "@lib/trpc";

import { EmbedButton, EmbedDialog } from "@components/Embed";
import Shell from "@components/Shell";
import ConfirmationDialogContent from "@components/dialog/ConfirmationDialogContent";
import CreateEventTypeButton from "@components/eventtype/CreateEventType";
import EventTypeDescription from "@components/eventtype/EventTypeDescription";
import SkeletonLoader from "@components/eventtype/SkeletonLoader";
import Avatar from "@components/ui/Avatar";
import AvatarGroup from "@components/ui/AvatarGroup";
import Badge from "@components/ui/Badge";

type EventTypeGroups = inferQueryOutput<"viewer.eventTypes">["eventTypeGroups"];
type EventTypeGroupProfile = EventTypeGroups[number]["profile"];
interface EventTypeListHeadingProps {
  profile: EventTypeGroupProfile;
  membershipCount: number;
}

type EventTypeGroup = inferQueryOutput<"viewer.eventTypes">["eventTypeGroups"][number];
type EventType = EventTypeGroup["eventTypes"][number];
interface EventTypeListProps {
  group: EventTypeGroup;
  groupIndex: number;
  readOnly: boolean;
  types: EventType[];
}

const Item = ({ type, group, readOnly }: { type: EventType; group: EventTypeGroup; readOnly: boolean }) => {
  const { t } = useLocale();

  return (
    <Link href={"/event-types/" + type.id}>
      <a
        className={classNames(
          "flex-grow truncate text-sm ",
          type.$disabled && "pointer-events-none cursor-not-allowed opacity-30"
        )}
        title={`${type.title} ${type.description ? `– ${type.description}` : ""}`}>
        <div>
          <span
            className="truncate font-medium text-neutral-900 ltr:mr-1 rtl:ml-1"
            data-testid={"event-type-title-" + type.id}>
            {type.title}
          </span>
          <small
            className="hidden text-neutral-500 sm:inline"
            data-testid={"event-type-slug-" + type.id}>{`/${group.profile.slug}/${type.slug}`}</small>
          {type.hidden && (
            <span className="rtl:mr-2inline items-center rounded-sm bg-yellow-100 px-1.5 py-0.5 text-xs font-medium text-yellow-800 ltr:ml-2">
              {t("hidden") as string}
            </span>
          )}
          {readOnly && (
            <span className="rtl:mr-2inline items-center rounded-sm bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-800 ltr:ml-2">
              {t("readonly") as string}
            </span>
          )}
        </div>
        <EventTypeDescription eventType={type} />
      </a>
    </Link>
  );
};

const MemoizedItem = React.memo(Item);

export const EventTypeList = ({ group, groupIndex, readOnly, types }: EventTypeListProps): JSX.Element => {
  const { t } = useLocale();
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteDialogTypeId, setDeleteDialogTypeId] = useState(0);
  const utils = trpc.useContext();
  const mutation = trpc.useMutation("viewer.eventTypeOrder", {
    onError: async (err) => {
      console.error(err.message);
      await utils.cancelQuery(["viewer.eventTypes"]);
      await utils.invalidateQueries(["viewer.eventTypes"]);
    },
    onSettled: async () => {
      await utils.invalidateQueries(["viewer.eventTypes"]);
    },
  });

  function moveEventType(index: number, increment: 1 | -1) {
    const newList = [...types];

    const type = types[index];
    const tmp = types[index + increment];
    if (tmp) {
      newList[index] = tmp;
      newList[index + increment] = type;
    }

    utils.cancelQuery(["viewer.eventTypes"]);
    utils.setQueryData(["viewer.eventTypes"], (data) => {
      // tRPC is very strict with the return signature...
      if (!data)
        return { eventTypeGroups: [], profiles: [], viewer: { canAddEvents: false, plan: UserPlan.FREE } };
      return {
        ...data,
        eventTypesGroups: [
          ...data.eventTypeGroups.slice(0, groupIndex),
          { ...group, eventTypes: newList },
          ...data.eventTypeGroups.slice(groupIndex + 1),
        ],
      };
    });

    mutation.mutate({
      ids: newList.map((type) => type.id),
    });
  }

  async function deleteEventTypeHandler(id: number) {
    const payload = { id };
    deleteMutation.mutate(payload);
  }

  // inject selection data into url for correct router history
  const openModal = (group: EventTypeGroup, type: EventType) => {
    const query = {
      ...router.query,
      dialog: "new-eventtype",
      eventPage: group.profile.slug,
      title: type.title,
      slug: type.slug,
      description: type.description,
      length: type.length,
      type: type.schedulingType,
      teamId: group.teamId,
    };
    if (!group.teamId) {
      delete query.teamId;
    }
    router.push(
      {
        pathname: router.pathname,
        query,
      },
      undefined,
      { shallow: true }
    );
  };

  const deleteMutation = trpc.useMutation("viewer.eventTypes.delete", {
    onSuccess: async () => {
      await utils.invalidateQueries(["viewer.eventTypes"]);
      showToast(t("event_type_deleted_successfully"), "success");
      setDeleteDialogOpen(false);
    },
    onError: (err) => {
      if (err instanceof HttpError) {
        const message = `${err.statusCode}: ${err.message}`;
        showToast(message, "error");
        setDeleteDialogOpen(false);
      }
    },
  });

  const [isNativeShare, setNativeShare] = useState(true);

  useEffect(() => {
    if (!navigator.share) {
      setNativeShare(false);
    }
  }, []);

  return (
    <div className="-mx-4 mb-16 overflow-hidden rounded-sm border border-gray-200 bg-white sm:mx-0">
      <ul className="divide-y divide-neutral-200" data-testid="event-types">
        {types.map((type, index) => (
          <li
            key={type.id}
            className={classNames(type.$disabled && "select-none")}
            data-disabled={type.$disabled ? 1 : 0}>
            <div
              className={classNames(
                "flex items-center justify-between hover:bg-neutral-50 ",
                type.$disabled && "hover:bg-white"
              )}>
              <div
                className={classNames(
                  "group flex w-full items-center justify-between px-4 py-4 hover:bg-neutral-50 sm:px-6",
                  type.$disabled && "hover:bg-white"
                )}>
                {types.length > 1 && !type.$disabled && (
                  <>
                    <button
                      className="invisible absolute left-1/2 -mt-4 mb-4 -ml-4 hidden h-7 w-7 scale-0 rounded-full border bg-white p-1 text-gray-400 transition-all hover:border-transparent hover:text-black hover:shadow group-hover:visible group-hover:scale-100 sm:left-[19px] sm:ml-0 sm:block"
                      onClick={() => moveEventType(index, -1)}>
                      <ArrowUpIcon />
                    </button>

                    <button
                      className="invisible absolute left-1/2 mt-8 -ml-4 hidden h-7 w-7 scale-0 rounded-full border bg-white p-1 text-gray-400 transition-all hover:border-transparent hover:text-black hover:shadow group-hover:visible group-hover:scale-100 sm:left-[19px] sm:ml-0 sm:block"
                      onClick={() => moveEventType(index, 1)}>
                      <ArrowDownIcon />
                    </button>
                  </>
                )}
                <MemoizedItem type={type} group={group} readOnly={readOnly} />
                <div className="mt-4 hidden flex-shrink-0 sm:mt-0 sm:ml-5 sm:flex">
                  <div className="flex justify-between space-x-2 rtl:space-x-reverse">
                    {type.users?.length > 1 && (
                      <AvatarGroup
                        border="border-2 border-white"
                        className={classNames("relative top-1 right-3", type.$disabled && " opacity-30")}
                        size={8}
                        truncateAfter={4}
                        items={type.users.map((organizer) => ({
                          alt: organizer.name || "",
                          image: `${WEBAPP_URL}/${organizer.username}/avatar.png`,
                        }))}
                      />
                    )}
                    <div
                      className={classNames(
                        "flex justify-between space-x-2 rtl:space-x-reverse ",
                        type.$disabled && "pointer-events-none cursor-not-allowed"
                      )}>
                      <Tooltip content={t("preview") as string}>
                        <a
                          href={`${CAL_URL}/${group.profile.slug}/${type.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className={classNames("btn-icon appearance-none", type.$disabled && " opacity-30")}>
                          <ExternalLinkIcon
                            className={classNames("h-5 w-5", !type.$disabled && "group-hover:text-black")}
                          />
                        </a>
                      </Tooltip>

                      <Tooltip content={t("copy_link") as string}>
                        <button
                          onClick={() => {
                            showToast(t("link_copied"), "success");
                            navigator.clipboard.writeText(`${CAL_URL}/${group.profile.slug}/${type.slug}`);
                          }}
                          className={classNames("btn-icon", type.$disabled && " opacity-30")}>
                          <LinkIcon
                            className={classNames("h-5 w-5", !type.$disabled && "group-hover:text-black")}
                          />
                        </button>
                      </Tooltip>
                    </div>
                    <Dropdown>
                      <DropdownMenuTrigger
                        className="h-10 w-10 cursor-pointer rounded-sm border border-transparent text-neutral-500 hover:border-gray-300 hover:text-neutral-900 focus:border-gray-300"
                        data-testid={"event-type-options-" + type.id}>
                        <DotsHorizontalIcon className="h-5 w-5 group-hover:text-gray-800" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem>
                          <Link href={"/event-types/" + type.id} passHref={true}>
                            <Button
                              type="button"
                              size="sm"
                              color="minimal"
                              className={classNames(
                                "w-full rounded-none",
                                type.$disabled && " pointer-events-none cursor-not-allowed opacity-30"
                              )}
                              StartIcon={PencilIcon}>
                              {t("edit") as string}
                            </Button>
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Button
                            type="button"
                            color="minimal"
                            size="sm"
                            className={classNames(
                              "w-full rounded-none",
                              type.$disabled && " pointer-events-none cursor-not-allowed opacity-30"
                            )}
                            data-testid={"event-type-duplicate-" + type.id}
                            StartIcon={DuplicateIcon}
                            onClick={() => openModal(group, type)}>
                            {t("duplicate") as string}
                          </Button>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <EmbedButton
                            dark
                            className={classNames(
                              "w-full rounded-none",
                              type.$disabled && " pointer-events-none cursor-not-allowed opacity-30"
                            )}
                            eventTypeId={type.id}></EmbedButton>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="h-px bg-gray-200" />
                        <DropdownMenuItem>
                          <Button
                            onClick={() => {
                              setDeleteDialogOpen(true);
                              setDeleteDialogTypeId(type.id);
                            }}
                            color="warn"
                            size="sm"
                            StartIcon={TrashIcon}
                            className="w-full rounded-none">
                            {t("delete") as string}
                          </Button>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </Dropdown>
                  </div>
                </div>
              </div>
              <div className="mr-5 flex flex-shrink-0 sm:hidden">
                <Dropdown>
                  <DropdownMenuTrigger className="h-10 w-10 cursor-pointer rounded-sm border border-transparent text-neutral-500 hover:border-gray-300 hover:text-neutral-900">
                    <DotsHorizontalIcon className="h-5 w-5 group-hover:text-gray-800" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent portalled>
                    <DropdownMenuItem>
                      <Link href={`${CAL_URL}/${group.profile.slug}/${type.slug}`}>
                        <a target="_blank">
                          <Button
                            color="minimal"
                            size="sm"
                            StartIcon={ExternalLinkIcon}
                            className="w-full rounded-none">
                            {t("preview") as string}
                          </Button>
                        </a>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Button
                        type="button"
                        color="minimal"
                        size="sm"
                        className="w-full rounded-none text-left"
                        data-testid={"event-type-duplicate-" + type.id}
                        StartIcon={ClipboardCopyIcon}
                        onClick={() => {
                          navigator.clipboard.writeText(`${CAL_URL}/${group.profile.slug}/${type.slug}`);
                          showToast(t("link_copied"), "success");
                        }}>
                        {t("copy_link") as string}
                      </Button>
                    </DropdownMenuItem>
                    {isNativeShare ? (
                      <DropdownMenuItem>
                        <Button
                          type="button"
                          color="minimal"
                          size="sm"
                          className="w-full rounded-none"
                          data-testid={"event-type-duplicate-" + type.id}
                          StartIcon={UploadIcon}
                          onClick={() => {
                            navigator
                              .share({
                                title: t("share"),
                                text: t("share_event"),
                                url: `${CAL_URL}/${group.profile.slug}/${type.slug}`,
                              })
                              .then(() => showToast(t("link_shared"), "success"))
                              .catch(() => showToast(t("failed"), "error"));
                          }}>
                          {t("share") as string}
                        </Button>
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem>
                      <Button
                        type="button"
                        size="sm"
                        href={"/event-types/" + type.id}
                        color="minimal"
                        className="w-full rounded-none"
                        StartIcon={PencilIcon}>
                        {t("edit") as string}
                      </Button>
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Button
                        type="button"
                        color="minimal"
                        size="sm"
                        className="w-full rounded-none"
                        data-testid={"event-type-duplicate-" + type.id}
                        StartIcon={DuplicateIcon}
                        onClick={() => openModal(group, type)}>
                        {t("duplicate") as string}
                      </Button>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="h-px bg-gray-200" />
                    <DropdownMenuItem>
                      <Button
                        onClick={() => {
                          setDeleteDialogOpen(true);
                          setDeleteDialogTypeId(type.id);
                        }}
                        color="warn"
                        size="sm"
                        StartIcon={TrashIcon}
                        className="w-full rounded-none">
                        {t("delete") as string}
                      </Button>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </Dropdown>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <ConfirmationDialogContent
          isLoading={deleteMutation.isLoading}
          variety="danger"
          title={t("delete_event_type")}
          confirmBtnText={t("confirm_delete_event_type")}
          loadingText={t("confirm_delete_event_type")}
          onConfirm={(e) => {
            e.preventDefault();
            deleteEventTypeHandler(deleteDialogTypeId);
          }}>
          {t("delete_event_type_description") as string}
        </ConfirmationDialogContent>
      </Dialog>
    </div>
  );
};

const EventTypeListHeading = ({ profile, membershipCount }: EventTypeListHeadingProps): JSX.Element => {
  console.log(profile.slug);
  return (
    <div className="mb-4 flex">
      <Link href="/settings/teams">
        <a>
          <Avatar
            alt={profile?.name || ""}
            imageSrc={`${WEBAPP_URL}/${profile.slug}/avatar.png` || undefined}
            size={8}
            className="mt-1 inline ltr:mr-2 rtl:ml-2"
          />
        </a>
      </Link>
      <div>
        <Link href="/settings/teams">
          <a className="font-bold">{profile?.name || ""}</a>
        </Link>
        {membershipCount && (
          <span className="relative -top-px text-xs text-neutral-500 ltr:ml-2 rtl:mr-2">
            <Link href="/settings/teams">
              <a>
                <Badge variant="gray">
                  <UsersIcon className="mr-1 -mt-px inline h-3 w-3" />
                  {membershipCount}
                </Badge>
              </a>
            </Link>
          </span>
        )}
        {profile?.slug && (
          <Link href={`${CAL_URL}/${profile.slug}`}>
            <a className="block text-xs text-neutral-500">{`${CAL_URL?.replace("https://", "")}/${
              profile.slug
            }`}</a>
          </Link>
        )}
      </div>
    </div>
  );
};

const CreateFirstEventTypeView = () => {
  const { t } = useLocale();

  return (
    <EmptyScreen
      Icon={CalendarIcon}
      headline={t("new_event_type_heading")}
      description={t("new_event_type_description")}
    />
  );
};

const CTA = () => {
  const query = trpc.useQuery(["viewer.eventTypes"]);

  if (!query.data) return null;

  return (
    <CreateEventTypeButton canAddEvents={query.data.viewer.canAddEvents} options={query.data.profiles} />
  );
};

const WithQuery = withQuery(["viewer.eventTypes"]);

const EventTypesPage = () => {
  const { t } = useLocale();
  return (
    <div>
      <Head>
        <title>Home | Cal.com</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <Shell
        heading={t("event_types_page_title") as string}
        subtitle={t("event_types_page_subtitle") as string}
        CTA={<CTA />}
        customLoader={<SkeletonLoader />}>
        <WithQuery
          customLoader={<SkeletonLoader />}
          success={({ data }) => (
            <>
              {data.viewer.plan === "FREE" && !data.viewer.canAddEvents && (
                <Alert
                  severity="warning"
                  title={<>{t("plan_upgrade")}</>}
                  message={
                    <Trans i18nKey="plan_upgrade_instructions">
                      You can
                      <a href="/api/upgrade" className="underline">
                        upgrade here
                      </a>
                      .
                    </Trans>
                  }
                  className="mb-4"
                />
              )}
              {data.eventTypeGroups.map((group, index) => (
                <Fragment key={group.profile.slug}>
                  {/* hide list heading when there is only one (current user) */}
                  {(data.eventTypeGroups.length !== 1 || group.teamId) && (
                    <EventTypeListHeading
                      profile={group.profile}
                      membershipCount={group.metadata.membershipCount}
                    />
                  )}
                  <EventTypeList
                    types={group.eventTypes}
                    group={group}
                    groupIndex={index}
                    readOnly={group.metadata.readOnly}
                  />
                </Fragment>
              ))}

              {data.eventTypeGroups.length === 0 && <CreateFirstEventTypeView />}
              <EmbedDialog />
            </>
          )}
        />
      </Shell>
    </div>
  );
};

export default EventTypesPage;
