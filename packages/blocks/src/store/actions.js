/**
 * External dependencies
 */
import { isPlainObject } from 'is-plain-object';

/**
 * WordPress dependencies
 */
import deprecated from '@wordpress/deprecated';
import { applyFilters } from '@wordpress/hooks';

/**
 * Internal dependencies
 */
import { isValidIcon, normalizeIconObject, omit } from '../api/utils';
import { DEPRECATED_ENTRY_KEYS } from '../api/constants';

/**
 * @typedef {import('../types').BlockAttributes} BlockAttributes
 * @typedef {import('../types').BlockCategory} BlockCategory
 * @typedef {import('../types').BlockCollection} BlockCollection
 * @typedef {import('../types').BlockDeprecation} BlockDeprecation
 * @typedef {import('../types').BlockIconRenderer} BlockIconRenderer
 * @typedef {import('../types').BlockVariation} BlockVariation
 * @typedef {import('../types').BlockStyle} BlockStyle
 * @typedef {import('../types').BlockType} BlockType
 * @typedef {import('../types').BlockTypeCategory} BlockTypeCategory
 */

const { error, warn } = window.console;

/**
 * Mapping of legacy category slugs to their latest normal values, used to
 * accommodate updates of the default set of block categories.
 *
 * @type {Record<string,BlockTypeCategory>}
 */
const LEGACY_CATEGORY_MAPPING = {
	common: 'text',
	formatting: 'text',
	layout: 'design',
};

/**
 * Whether the argument is a function.
 *
 * @param {*} maybeFunc The argument to check.
 * @return {boolean} True if the argument is a function, false otherwise.
 */
function isFunction( maybeFunc ) {
	return typeof maybeFunc === 'function';
}

/**
 * Takes the unprocessed block type data and applies all the existing filters for the registered block type.
 * Next, it validates all the settings and performs additional processing to the block type definition.
 *
 * TODO Originally `thunkArgs.select` was typed as a function, but it is used as an object
 *
 * @param {BlockType} blockType        Unprocessed block type settings.
 * @param {Object}    thunkArgs        Argument object for the thunk middleware.
 * @param {Object}    thunkArgs.select Function to select from the store.
 *
 * @return {BlockType | undefined} The block, if it has been successfully registered; otherwise `undefined`.
 */
const processBlockType = ( blockType, { select } ) => {
	const { name } = blockType;

	const settings = applyFilters(
		'blocks.registerBlockType',
		{ ...blockType },
		name,
		null
	);

	if ( settings.description && typeof settings.description !== 'string' ) {
		deprecated( 'Declaring non-string block descriptions', {
			since: '6.2',
		} );
	}

	if ( settings.deprecated ) {
		settings.deprecated = settings.deprecated.map( ( deprecation ) =>
			Object.fromEntries(
				Object.entries(
					// Only keep valid deprecation keys.
					applyFilters(
						'blocks.registerBlockType',
						// Merge deprecation keys with pre-filter settings
						// so that filters that depend on specific keys being
						// present don't fail.
						{
							// Omit deprecation keys here so that deprecations
							// can opt out of specific keys like "supports".
							...omit( blockType, DEPRECATED_ENTRY_KEYS ),
							...deprecation,
						},
						name,
						deprecation
					)
				).filter( ( [ key ] ) => DEPRECATED_ENTRY_KEYS.includes( key ) )
			)
		);
	}

	if ( ! isPlainObject( settings ) ) {
		error( 'Block settings must be a valid object.' );
		return;
	}

	if ( ! isFunction( settings.save ) ) {
		error( 'The "save" property must be a valid function.' );
		return;
	}
	if ( 'edit' in settings && ! isFunction( settings.edit ) ) {
		error( 'The "edit" property must be a valid function.' );
		return;
	}

	// Canonicalize legacy categories to equivalent fallback.
	if ( LEGACY_CATEGORY_MAPPING.hasOwnProperty( settings.category ) ) {
		settings.category = LEGACY_CATEGORY_MAPPING[ settings.category ];
	}

	if (
		'category' in settings &&
		! select
			.getCategories()
			.some( ( { slug } ) => slug === settings.category )
	) {
		warn(
			'The block "' +
				name +
				'" is registered with an invalid category "' +
				settings.category +
				'".'
		);
		delete settings.category;
	}

	if ( ! ( 'title' in settings ) || settings.title === '' ) {
		error( 'The block "' + name + '" must have a title.' );
		return;
	}
	if ( typeof settings.title !== 'string' ) {
		error( 'Block titles must be strings.' );
		return;
	}

	settings.icon = normalizeIconObject( settings.icon );
	if ( ! isValidIcon( settings.icon.src ) ) {
		error(
			'The icon passed is invalid. ' +
				'The icon should be a string, an element, a function, or an object following the specifications documented in https://developer.wordpress.org/block-editor/developers/block-api/block-registration/#icon-optional'
		);
		return;
	}

	return settings;
};

/**
 * @typedef {Object} AddBlockTypesAction
 * @property {'ADD_BLOCK_TYPES'} type       The action type.
 * @property {BlockType[]}       blockTypes The `BlockType`s to add.
 */

/**
 * Returns an action object used in signalling that block types have been added.
 * Ignored from documentation as the recommended usage for this action through registerBlockType from @wordpress/blocks.
 *
 * @ignore
 *
 * @param {BlockType|BlockType[]} blockTypes Object or array of objects representing blocks to added.
 *
 *
 * @return {AddBlockTypesAction} Action object.
 */
export function addBlockTypes( blockTypes ) {
	return {
		type: 'ADD_BLOCK_TYPES',
		blockTypes: Array.isArray( blockTypes ) ? blockTypes : [ blockTypes ],
	};
}

/**
 * Signals that the passed block type's settings should be stored in the state.
 *
 * @param {BlockType} blockType Unprocessed block type settings.
 */
export const __experimentalRegisterBlockType =
	( blockType ) =>
	( { dispatch, select } ) => {
		dispatch( {
			type: 'ADD_UNPROCESSED_BLOCK_TYPE',
			blockType,
		} );

		const processedBlockType = processBlockType( blockType, { select } );
		if ( ! processedBlockType ) {
			return;
		}
		dispatch.addBlockTypes( processedBlockType );
	};

/**
 * Signals that all block types should be computed again.
 * It uses stored unprocessed block types and all the most recent list of registered filters.
 *
 * It addresses the issue where third party block filters get registered after third party blocks. A sample sequence:
 *   1. Filter A.
 *   2. Block B.
 *   3. Block C.
 *   4. Filter D.
 *   5. Filter E.
 *   6. Block F.
 *   7. Filter G.
 * In this scenario some filters would not get applied for all blocks because they are registered too late.
 */
export const __experimentalReapplyBlockTypeFilters =
	() =>
	( { dispatch, select } ) => {
		const unprocessedBlockTypes =
			select.__experimentalGetUnprocessedBlockTypes();

		const processedBlockTypes = Object.keys( unprocessedBlockTypes ).reduce(
			( accumulator, blockName ) => {
				const result = processBlockType(
					unprocessedBlockTypes[ blockName ],
					{ select }
				);
				if ( result ) {
					accumulator.push( result );
				}
				return accumulator;
			},
			[]
		);

		if ( ! processedBlockTypes.length ) {
			return;
		}

		dispatch.addBlockTypes( processedBlockTypes );
	};

/**
 * @typedef {Object} RemoveBlockTypesAction
 * @property {'REMOVE_BLOCK_TYPES'} type  The action type.
 * @property {string[]}             names The names of the`BlockType`s to remove.
 */

/**
 * Returns an action object used to remove a registered block type.
 * Ignored from documentation as the recommended usage for this action through unregisterBlockType from @wordpress/blocks.
 *
 * @ignore
 *
 * @param {string|string[]} names Block name or array of block names to be removed.
 *
 *
 * @return {RemoveBlockTypesAction} Action object.
 */
export function removeBlockTypes( names ) {
	return {
		type: 'REMOVE_BLOCK_TYPES',
		names: Array.isArray( names ) ? names : [ names ],
	};
}

/**
 * @typedef {Object} AddBlockStylesAction
 * @property {'ADD_BLOCK_STYLES'} type      The action type.
 * @property {string}             blockName The name of the`BlockType` to add styles to.
 * @property {BlockStyle[]}       styles    The `BlockStyle`s to add.
 */

/**
 * Returns an action object used in signalling that new block styles have been added.
 * Ignored from documentation as the recommended usage for this action through registerBlockStyle from @wordpress/blocks.
 *
 * @param {string}                  blockName Block name.
 * @param {BlockStyle|BlockStyle[]} styles    Block style object or array of block style objects.
 *
 * @ignore
 *
 * @return {AddBlockStylesAction} Action object.
 */
export function addBlockStyles( blockName, styles ) {
	return {
		type: 'ADD_BLOCK_STYLES',
		styles: Array.isArray( styles ) ? styles : [ styles ],
		blockName,
	};
}

/**
 * @typedef {Object} RemoveBlockStylesAction
 * @property {'REMOVE_BLOCK_STYLES'} type       The action type.
 * @property {string}                blockName  The name of the`BlockType` to remove styles from.
 * @property {string[]}              styleNames The names of the `BlockStyle`s to remove.
 */

/**
 * Returns an action object used in signalling that block styles have been removed.
 * Ignored from documentation as the recommended usage for this action through unregisterBlockStyle from @wordpress/blocks.
 *
 * @ignore
 *
 * @param {string}          blockName  Block name.
 * @param {string|string[]} styleNames Block style names or array of block style names.
 *
 * @return {RemoveBlockStylesAction} Action object.
 */
export function removeBlockStyles( blockName, styleNames ) {
	return {
		type: 'REMOVE_BLOCK_STYLES',
		styleNames: Array.isArray( styleNames ) ? styleNames : [ styleNames ],
		blockName,
	};
}

/**
 * @typedef {Object} AddBlockVariationsAction
 * @property {'ADD_BLOCK_VARIATIONS'} type       The action type.
 * @property {string}                 blockName  The name of the`BlockType` to add variations to.
 * @property {BlockStyle[]}           variations The `BlockVariations`s to add.
 */

/**
 * Returns an action object used in signalling that new block variations have been added.
 * Ignored from documentation as the recommended usage for this action through registerBlockVariation from @wordpress/blocks.
 *
 * @ignore
 *
 * @param {string}                          blockName  Block name.
 * @param {BlockVariation|BlockVariation[]} variations Block variations.
 *
 * @return {AddBlockVariationsAction} Action object.
 */
export function addBlockVariations( blockName, variations ) {
	return {
		type: 'ADD_BLOCK_VARIATIONS',
		variations: Array.isArray( variations ) ? variations : [ variations ],
		blockName,
	};
}

/**
 * @typedef {Object} RemoveBlockVariationsAction
 * @property {'REMOVE_BLOCK_VARIATIONS'} type           The action type.
 * @property {string}                    blockName      The name of the`BlockType` to remove variations from.
 * @property {string[]}                  variationNames The names of the `BlockVariations`s to remove.
 */

/**
 * Returns an action object used in signalling that block variations have been removed.
 * Ignored from documentation as the recommended usage for this action through unregisterBlockVariation from @wordpress/blocks.
 *
 * @ignore
 *
 * @param {string}          blockName      Block name.
 * @param {string|string[]} variationNames Block variation names.
 *
 * @return {RemoveBlockVariationsAction} Action object.
 */
export function removeBlockVariations( blockName, variationNames ) {
	return {
		type: 'REMOVE_BLOCK_VARIATIONS',
		variationNames: Array.isArray( variationNames )
			? variationNames
			: [ variationNames ],
		blockName,
	};
}

/**
 * Returns an action object used to set the default block name.
 * Ignored from documentation as the recommended usage for this action through setDefaultBlockName from @wordpress/blocks.
 *
 * @ignore
 *
 * @param {string} name Block name.
 *
 * @return {{type: 'SET_DEFAULT_BLOCK_NAME', name: string}} Action object.
 */
export function setDefaultBlockName( name ) {
	return {
		type: 'SET_DEFAULT_BLOCK_NAME',
		name,
	};
}

/**
 * Returns an action object used to set the name of the block used as a fallback
 * for non-block content.
 * Ignored from documentation as the recommended usage for this action through setFreeformContentHandlerName from @wordpress/blocks.
 *
 * @ignore
 *
 * @param {string} name Block name.
 *
 * @return {{type: 'SET_FREEFORM_FALLBACK_BLOCK_NAME', name: string}} Action object.
 */
export function setFreeformFallbackBlockName( name ) {
	return {
		type: 'SET_FREEFORM_FALLBACK_BLOCK_NAME',
		name,
	};
}

/**
 * Returns an action object used to set the name of the block used as a fallback
 * for unregistered blocks.
 * Ignored from documentation as the recommended usage for this action through setUnregisteredTypeHandlerName from @wordpress/blocks.
 *
 * @ignore
 *
 * @param {string} name Block name.
 *
 * @return {{type: 'SET_UNREGISTERED_FALLBACK_BLOCK_NAME', name: string}} Action object.
 */
export function setUnregisteredFallbackBlockName( name ) {
	return {
		type: 'SET_UNREGISTERED_FALLBACK_BLOCK_NAME',
		name,
	};
}

/**
 * Returns an action object used to set the name of the block used
 * when grouping other blocks
 * eg: in "Group/Ungroup" interactions
 * Ignored from documentation as the recommended usage for this action through setGroupingBlockName from @wordpress/blocks.
 *
 * @ignore
 *
 * @param {string} name Block name.
 *
 * @return {{type: 'SET_GROUPING_BLOCK_NAME', name: string}} Action object.
 */
export function setGroupingBlockName( name ) {
	return {
		type: 'SET_GROUPING_BLOCK_NAME',
		name,
	};
}

/**
 * Returns an action object used to set block categories.
 * Ignored from documentation as the recommended usage for this action through setCategories from @wordpress/blocks.
 *
 * @ignore
 *
 * @param {BlockCategory[]} categories Block categories.
 *
 * @return {{type: 'SET_CATEGORIES', categories: BlockCategory[]}} Action object.
 */
export function setCategories( categories ) {
	return {
		type: 'SET_CATEGORIES',
		categories,
	};
}

/**
 * Returns an action object used to update a category.
 * Ignored from documentation as the recommended usage for this action through updateCategory from @wordpress/blocks.
 *
 * @ignore
 *
 * @param {string}                 slug     Block category slug.
 * @param {Partial<BlockCategory>} category Object containing the category properties that should be updated.
 *
 * @return {{type: 'UPDATE_CATEGORY', slug: string, category: BlockCategory}} Action object.
 */
export function updateCategory( slug, category ) {
	return {
		type: 'UPDATE_CATEGORY',
		slug,
		category,
	};
}

/**
 * Returns an action object used to add block collections
 * Ignored from documentation as the recommended usage for this action through registerBlockCollection from @wordpress/blocks.
 *
 * @ignore
 *
 * @param {string}            namespace The namespace of the blocks to put in the collection
 * @param {string}            title     The title to display in the block inserter
 * @param {BlockIconRenderer} icon      (optional) The icon to display in the block inserter
 *
 * @return {{type: 'ADD_BLOCK_COLLECTION', namespace: string, title: string, icon: BlockIconRenderer}} Action object.
 */
export function addBlockCollection( namespace, title, icon ) {
	return {
		type: 'ADD_BLOCK_COLLECTION',
		namespace,
		title,
		icon,
	};
}

/**
 * Returns an action object used to remove block collections
 * Ignored from documentation as the recommended usage for this action through unregisterBlockCollection from @wordpress/blocks.
 *
 * @ignore
 *
 * @param {string} namespace The namespace of the blocks to put in the collection
 *
 * @return {{type: 'REMOVE_BLOCK_COLLECTION', namespace: string}} Action object.
 */
export function removeBlockCollection( namespace ) {
	return {
		type: 'REMOVE_BLOCK_COLLECTION',
		namespace,
	};
}
