/**
 * WordPress dependencies
 */
import deprecated from '@wordpress/deprecated';

/**
 * @typedef {import('@wordpress/element').WPComponent} WPComponent
 */

/**
 * A Higher Order Component used to inject BlockContent using context to the
 * wrapped component.
 *
 * @deprecated
 *
 * @param {WPComponent} OriginalComponent The component to enhance.
 * @return {WPComponent} The same component.
 */
export function withBlockContentContext( OriginalComponent ) {
	deprecated( 'wp.blocks.withBlockContentContext', {
		since: '6.1',
	} );

	return OriginalComponent;
}
