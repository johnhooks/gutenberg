/**
 * Describes options for Block serialization.
 *
 * Used by the Block [serializer](./api/serializer.js).
 *
 * @public
 */
export type BlockSerializationOptions = {
	/**
	 * TODO Undocumented
	 */
	isCommentDelimited?: boolean;

	/**
	 * TODO Undocumented
	 */
	isInnerBlocks?: boolean;

	/**
	 * If a block is migrated from a deprecated version, skip logging the migration details.
	 *
	 * @internal
	 */
	__unstableSkipMigrationLogs?: boolean;

	/**
	 * Whether to skip autop when processing freeform content.
	 *
	 * @internal
	 */
	__unstableSkipAutop?: boolean;
};

/**
 * Describes options for Block parsing.
 *
 * Used by the block [parser](./api/parser/index.js).
 *
 * @public
 */
export type BlockParseOptions = {
	/**
	 * If a block is migrated from a deprecated version, skip logging the migration details.
	 *
	 * @internal
	 */
	__unstableSkipMigrationLogs?: boolean;

	/**
	 * Whether to skip autop when processing freeform content.
	 *
	 * @internal
	 */
	__unstableSkipAutop?: boolean;
};
