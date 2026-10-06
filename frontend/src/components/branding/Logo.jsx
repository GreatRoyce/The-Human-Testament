import PropTypes from 'prop-types'
import primaryLogo from '../../assets/images/logo/primary.png'
import secondaryLogo from '../../assets/images/logo/secondary.png'
import horizontalLogo from '../../assets/images/logo/horizontal.png'
import monochromeLogo from '../../assets/images/logo/monochrome.png'
import submarkLogo from '../../assets/images/logo/submark.png'
import faviconLogo from '../../assets/images/logo/favicon.png'

const logos = {
  primary: primaryLogo,
  secondary: secondaryLogo,
  horizontal: horizontalLogo,
  monochrome: monochromeLogo,
  submark: submarkLogo,
  favicon: faviconLogo,
}

const logoPropTypes = {
  type: PropTypes.oneOf(Object.keys(logos)),
  alt: PropTypes.string,
  className: PropTypes.string,
  imageClassName: PropTypes.string,
  width: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  height: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
}

export default function Logo({
  type = 'primary',
  alt = 'The Human Testament Logo',
  className = '',
  imageClassName = '',
  width,
  height,
  ...imageProps
}) {

  if (import.meta.env.DEV) {
    PropTypes.checkPropTypes(
      logoPropTypes,
      { type, alt, className, imageClassName, width, height },
      'prop',
      'Logo',
    )
  }

  const src = Object.hasOwn(logos, type) ? logos[type] : logos.primary

  return (
    <div className={`logo ${className}`.trim()}>
      <img
        {...imageProps}
        src={src}
        alt={alt}
        className={imageClassName}
        width={width}
        height={height}
      />
    </div>
  )
}
